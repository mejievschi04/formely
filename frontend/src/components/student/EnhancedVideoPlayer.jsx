import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
	ArrowsIn,
	ArrowsOut,
	FastForward,
	Pause,
	PictureInPicture,
	Play,
	Rewind,
	SpeakerHigh,
	SpeakerLow,
	SpeakerSlash,
} from '@phosphor-icons/react';
import './EnhancedVideoPlayer.css';

/**
 * Enhanced Video Player Component
 * Features:
 * - Speed control (0.25x - 3x)
 * - Picture-in-Picture mode
 * - Keyboard shortcuts
 * - Quality selector
 * - Subtitle support
 * - Auto-pause on tab switch
 * - Resume from last position
 * - Skip silence (future)
 */
const EnhancedVideoPlayer = forwardRef(({ 
	src, 
	poster,
	title,
	onProgress,
	onTimeUpdate,
	onEnded,
	className = '',
	autoplay = false,
	startTime = 0 // Resume from last position
}) => {
	const videoRef = useRef(null);
	const containerRef = useRef(null);
	const progressBarRef = useRef(null);
	const volumeSliderRef = useRef(null);
	
	// State
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(startTime);
	const [duration, setDuration] = useState(0);
	const [volume, setVolume] = useState(1);
	const [isMuted, setIsMuted] = useState(false);
	const [playbackRate, setPlaybackRate] = useState(1);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [isPiP, setIsPiP] = useState(false);
	const [showControls, setShowControls] = useState(true);
	const [buffered, setBuffered] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [showSpeedMenu, setShowSpeedMenu] = useState(false);
	const [showVolumeSlider, setShowVolumeSlider] = useState(false);
	
	// Available playback speeds
	const playbackSpeeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
	
	// Initialize video
	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		
		// Set initial time if provided
		if (startTime > 0) {
			video.currentTime = startTime;
		}
		
		// Set initial volume
		video.volume = volume;
		video.muted = isMuted;
		video.playbackRate = playbackRate;
		
		// Event listeners
		const handleLoadedMetadata = () => {
			setDuration(video.duration);
			setIsLoading(false);
			if (startTime > 0) {
				video.currentTime = startTime;
			}
		};
		
		const handleTimeUpdate = () => {
			const time = video.currentTime;
			setCurrentTime(time);
			if (onTimeUpdate) onTimeUpdate(time);
			
			// Update buffered
			if (video.buffered.length > 0) {
				const bufferedEnd = video.buffered.end(video.buffered.length - 1);
				setBuffered((bufferedEnd / duration) * 100);
			}
		};
		
		const handleProgress = () => {
			if (video.buffered.length > 0) {
				const bufferedEnd = video.buffered.end(video.buffered.length - 1);
				setBuffered((bufferedEnd / duration) * 100);
			}
			if (onProgress) onProgress(video.currentTime / duration);
		};
		
		const handlePlay = () => setIsPlaying(true);
		const handlePause = () => setIsPlaying(false);
		const handleEnded = () => {
			setIsPlaying(false);
			if (onEnded) onEnded();
		};
		
		const handleVolumeChange = () => {
			setVolume(video.volume);
			setIsMuted(video.muted);
		};
		
		const handleFullscreenChange = () => {
			setIsFullscreen(!!document.fullscreenElement);
		};
		
		video.addEventListener('loadedmetadata', handleLoadedMetadata);
		video.addEventListener('timeupdate', handleTimeUpdate);
		video.addEventListener('progress', handleProgress);
		video.addEventListener('play', handlePlay);
		video.addEventListener('pause', handlePause);
		video.addEventListener('ended', handleEnded);
		video.addEventListener('volumechange', handleVolumeChange);
		document.addEventListener('fullscreenchange', handleFullscreenChange);
		
		// Auto-pause on tab switch
		const handleVisibilityChange = () => {
			if (document.hidden && isPlaying) {
				video.pause();
			}
		};
		document.addEventListener('visibilitychange', handleVisibilityChange);
		
		return () => {
			video.removeEventListener('loadedmetadata', handleLoadedMetadata);
			video.removeEventListener('timeupdate', handleTimeUpdate);
			video.removeEventListener('progress', handleProgress);
			video.removeEventListener('play', handlePlay);
			video.removeEventListener('pause', handlePause);
			video.removeEventListener('ended', handleEnded);
			video.removeEventListener('volumechange', handleVolumeChange);
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	}, [src, startTime, duration, isPlaying, onProgress, onTimeUpdate, onEnded, volume, isMuted, playbackRate]);
	
	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e) => {
			// Don't trigger if user is typing in an input
			if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
			
			const video = videoRef.current;
			if (!video) return;
			
			switch (e.key) {
				case ' ': // Spacebar - Play/Pause
					e.preventDefault();
					togglePlay();
					break;
				case 'ArrowLeft': // Left arrow - Rewind 10s
					e.preventDefault();
					seek(-10);
					break;
				case 'ArrowRight': // Right arrow - Forward 10s
					e.preventDefault();
					seek(10);
					break;
				case 'ArrowUp': // Up arrow - Volume up
					e.preventDefault();
					setVolume(Math.min(1, volume + 0.1));
					break;
				case 'ArrowDown': // Down arrow - Volume down
					e.preventDefault();
					setVolume(Math.max(0, volume - 0.1));
					break;
				case 'm': // M - Mute/Unmute
				case 'M':
					e.preventDefault();
					toggleMute();
					break;
				case 'f': // F - Fullscreen
				case 'F':
					e.preventDefault();
					toggleFullscreen();
					break;
				case 'p': // P - Picture-in-Picture
				case 'P':
					e.preventDefault();
					togglePiP();
					break;
			}
		};
		
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [volume]);
	
	// Play/Pause
	const togglePlay = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;
		
		if (video.paused) {
			video.play();
		} else {
			video.pause();
		}
	}, []);
	
	// Seek
	const seek = useCallback((seconds) => {
		const video = videoRef.current;
		if (!video) return;
		
		const newTime = Math.max(0, Math.min(duration, video.currentTime + seconds));
		video.currentTime = newTime;
		setCurrentTime(newTime);
	}, [duration]);
	
	// Volume
	const handleVolumeChange = useCallback((e) => {
		const newVolume = parseFloat(e.target.value);
		setVolume(newVolume);
		const video = videoRef.current;
		if (video) {
			video.volume = newVolume;
			if (newVolume > 0) setIsMuted(false);
		}
	}, []);
	
	// Mute/Unmute
	const toggleMute = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;
		
		video.muted = !video.muted;
		setIsMuted(video.muted);
	}, []);
	
	// Playback speed
	const handleSpeedChange = useCallback((speed) => {
		const video = videoRef.current;
		if (video) {
			video.playbackRate = speed;
			setPlaybackRate(speed);
		}
		setShowSpeedMenu(false);
	}, []);
	
	// Fullscreen
	const toggleFullscreen = useCallback(() => {
		const container = containerRef.current;
		if (!container) return;
		
		if (!document.fullscreenElement) {
			container.requestFullscreen().catch(err => {
				console.error('Error attempting to enable fullscreen:', err);
			});
		} else {
			document.exitFullscreen();
		}
	}, []);
	
	// Picture-in-Picture
	const togglePiP = useCallback(async () => {
		const video = videoRef.current;
		if (!video) return;
		
		try {
			if (document.pictureInPictureElement) {
				await document.exitPictureInPicture();
				setIsPiP(false);
			} else if (document.pictureInPictureEnabled) {
				await video.requestPictureInPicture();
				setIsPiP(true);
			}
		} catch (err) {
			console.error('Error toggling Picture-in-Picture:', err);
		}
	}, []);
	
	// Progress bar click
	const handleProgressClick = useCallback((e) => {
		const progressBar = progressBarRef.current;
		if (!progressBar || !videoRef.current) return;
		
		const rect = progressBar.getBoundingClientRect();
		const percent = (e.clientX - rect.left) / rect.width;
		const newTime = percent * duration;
		
		videoRef.current.currentTime = newTime;
		setCurrentTime(newTime);
	}, [duration]);
	
	// Format time
	const formatTime = (seconds) => {
		if (!seconds || isNaN(seconds)) return '0:00';
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		
		if (h > 0) {
			return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
		}
		return `${m}:${s.toString().padStart(2, '0')}`;
	};
	
	// Show/hide controls on mouse move
	useEffect(() => {
		let timeout;
		const handleMouseMove = () => {
			setShowControls(true);
			clearTimeout(timeout);
			timeout = setTimeout(() => {
				if (isPlaying) {
					setShowControls(false);
				}
			}, 3000);
		};
		
		const container = containerRef.current;
		if (container) {
			container.addEventListener('mousemove', handleMouseMove);
		}
		
		return () => {
			clearTimeout(timeout);
			if (container) {
				container.removeEventListener('mousemove', handleMouseMove);
			}
		};
	}, [isPlaying]);
	
	return (
		<div 
			ref={containerRef}
			className={`enhanced-video-player ${className} ${showControls ? 'show-controls' : ''}`}
			onMouseEnter={() => setShowControls(true)}
			onMouseLeave={() => {
				if (isPlaying) {
					setTimeout(() => setShowControls(false), 2000);
				}
			}}
		>
			{isLoading && (
				<div className="enhanced-video-loading">
					<div className="enhanced-video-spinner"></div>
					<p>Se încarcă video-ul...</p>
				</div>
			)}
			
			<video
				ref={videoRef}
				src={src}
				poster={poster}
				className="enhanced-video-element"
				onClick={togglePlay}
			/>
			
			{/* Controls Overlay */}
			<div className={`enhanced-video-controls ${showControls ? 'visible' : ''}`}>
				{/* Progress Bar */}
				<div 
					ref={progressBarRef}
					className="enhanced-video-progress-container"
					onClick={handleProgressClick}
				>
					<div className="enhanced-video-progress-track">
						<div 
							className="enhanced-video-progress-buffered"
							style={{ width: `${buffered}%` }}
						/>
						<div 
							className="enhanced-video-progress-played"
							style={{ width: `${(currentTime / duration) * 100}%` }}
						/>
						<div 
							className="enhanced-video-progress-handle"
							style={{ left: `${(currentTime / duration) * 100}%` }}
						/>
					</div>
				</div>
				
				{/* Controls Bar */}
				<div className="enhanced-video-controls-bar">
					{/* Left Controls */}
					<div className="enhanced-video-controls-left">
						<button
							className="enhanced-video-control-btn"
							onClick={togglePlay}
							aria-label={isPlaying ? 'Pauză' : 'Redare'}
						>
							{isPlaying ? (
								<Pause size={20} weight="fill" aria-hidden />
							) : (
								<Play size={20} weight="fill" aria-hidden />
							)}
						</button>
						
						<button
							className="enhanced-video-control-btn"
							onClick={() => seek(-10)}
							aria-label="Înapoi 10 secunde"
						>
							<Rewind size={20} weight="fill" aria-hidden />
							<span className="enhanced-video-control-label">10</span>
						</button>
						
						<button
							className="enhanced-video-control-btn"
							onClick={() => seek(10)}
							aria-label="Înainte 10 secunde"
						>
							<FastForward size={20} weight="fill" aria-hidden />
							<span className="enhanced-video-control-label">10</span>
						</button>
						
						{/* Volume Control */}
						<div 
							className="enhanced-video-volume-container"
							onMouseEnter={() => setShowVolumeSlider(true)}
							onMouseLeave={() => setShowVolumeSlider(false)}
						>
							<button
								className="enhanced-video-control-btn"
								onClick={toggleMute}
								aria-label={isMuted ? 'Cu sunet' : 'Fără sunet'}
							>
								{isMuted || volume === 0 ? (
									<SpeakerSlash size={20} weight="fill" aria-hidden />
								) : volume < 0.5 ? (
									<SpeakerLow size={20} weight="fill" aria-hidden />
								) : (
									<SpeakerHigh size={20} weight="fill" aria-hidden />
								)}
							</button>
							{showVolumeSlider && (
								<div className="enhanced-video-volume-slider-container">
									<input
										ref={volumeSliderRef}
										type="range"
										min="0"
										max="1"
										step="0.01"
										value={volume}
										onChange={handleVolumeChange}
										className="enhanced-video-volume-slider"
									/>
									<div className="enhanced-video-volume-value">{Math.round(volume * 100)}%</div>
								</div>
							)}
						</div>
						
						{/* Time Display */}
						<div className="enhanced-video-time">
							{formatTime(currentTime)} / {formatTime(duration)}
						</div>
					</div>
					
					{/* Right Controls */}
					<div className="enhanced-video-controls-right">
						{/* Playback Speed */}
						<div className="enhanced-video-speed-container">
							<button
								className="enhanced-video-control-btn"
								onClick={() => setShowSpeedMenu(!showSpeedMenu)}
								aria-label="Viteză redare"
							>
								{playbackRate}x
							</button>
							{showSpeedMenu && (
								<div className="enhanced-video-speed-menu">
									{playbackSpeeds.map(speed => (
										<button
											key={speed}
											className={`enhanced-video-speed-option ${playbackRate === speed ? 'active' : ''}`}
											onClick={() => handleSpeedChange(speed)}
										>
											{speed}x
										</button>
									))}
								</div>
							)}
						</div>
						
						{/* Picture-in-Picture */}
						{document.pictureInPictureEnabled && (
							<button
								className="enhanced-video-control-btn"
								onClick={togglePiP}
								aria-label="Imagine în imagine"
							>
								<PictureInPicture size={20} weight="duotone" aria-hidden />
							</button>
						)}
						
						{/* Fullscreen */}
						<button
							className="enhanced-video-control-btn"
							onClick={toggleFullscreen}
							aria-label="Ecran complet"
						>
							{isFullscreen ? (
								<ArrowsIn size={20} weight="bold" aria-hidden />
							) : (
								<ArrowsOut size={20} weight="bold" aria-hidden />
							)}
						</button>
					</div>
				</div>
			</div>
			
			{/* Keyboard Shortcuts Hint */}
			{showControls && (
				<div className="enhanced-video-shortcuts-hint">
					<div className="enhanced-video-shortcuts-content">
						<div className="enhanced-video-shortcut-item">
							<kbd>Space</kbd> Play/Pause
						</div>
						<div className="enhanced-video-shortcut-item">
							<kbd>←</kbd>/<kbd>→</kbd> Seek
						</div>
						<div className="enhanced-video-shortcut-item">
							<kbd>M</kbd> Fără sunet
						</div>
						<div className="enhanced-video-shortcut-item">
							<kbd>F</kbd> Fullscreen
						</div>
					</div>
				</div>
			)}
		</div>
	);
});

EnhancedVideoPlayer.displayName = 'EnhancedVideoPlayer';

export default EnhancedVideoPlayer;
