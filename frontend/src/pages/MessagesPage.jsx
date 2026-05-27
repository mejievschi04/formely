import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
	ArrowLeft,
	ChatCircleText,
	Check,
	CircleNotch,
	PaperPlaneTilt,
	Plus,
	Trash,
	WarningCircle,
	X,
} from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { messagesService } from '../services/api';
import { logger } from '../utils/logger';
import { toImageUrl } from '../utils/imageUrl';
import ConfirmModal from '../components/common/ConfirmModal';

const MessagesPage = () => {
	const { user } = useAuth();
	const { showToast } = useToast();
	const [conversations, setConversations] = useState([]);
	const [allConversations, setAllConversations] = useState([]); // Store all conversations for search
	const [selectedConversation, setSelectedConversation] = useState(null);
	const [messages, setMessages] = useState([]);
	const [newMessage, setNewMessage] = useState('');
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState(null);
	const [sending, setSending] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [showNewConversationModal, setShowNewConversationModal] = useState(false);
	const [newConversationType, setNewConversationType] = useState('direct');
	const [newGroupName, setNewGroupName] = useState('');
	const [newConversationUserId, setNewConversationUserId] = useState('');
	const [newConversationUserIds, setNewConversationUserIds] = useState([]);
	const [newConversationSearch, setNewConversationSearch] = useState('');
	const [availableUsers, setAvailableUsers] = useState([]);
	const [loadingUsers, setLoadingUsers] = useState(false);
	const [showParticipantsModal, setShowParticipantsModal] = useState(false);
	const [groupParticipants, setGroupParticipants] = useState([]);
	const [participantsSearch, setParticipantsSearch] = useState('');
	const [participantsSearchResults, setParticipantsSearchResults] = useState([]);
	const [loadingParticipants, setLoadingParticipants] = useState(false);
	const [updatingParticipants, setUpdatingParticipants] = useState(false);
	const [groupRenameDraft, setGroupRenameDraft] = useState('');
	const [showLeaveGroupConfirm, setShowLeaveGroupConfirm] = useState(false);
	const [leavingGroup, setLeavingGroup] = useState(false);
	const [showDeleteConversationConfirm, setShowDeleteConversationConfirm] = useState(false);
	const [deletingConversation, setDeletingConversation] = useState(false);
	const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
	const messagesEndRef = useRef(null);
	const messagesContainerRef = useRef(null);
	const pollingIntervalRef = useRef(null);
	const conversationsPollingRef = useRef(null);
	const lastMessageIdRef = useRef(null);
	const messagesPollBackoffUntilRef = useRef(0);
	const conversationsPollBackoffUntilRef = useRef(0);
	const shouldAutoScrollRef = useRef(true);

	// Detect mobile viewport
	useEffect(() => {
		const handleResize = () => {
			setIsMobile(window.innerWidth <= 768);
		};
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	useEffect(() => {
		fetchConversations();

		// Reîncarcă conversațiile când pagina devine activă
		const handleVisibilityChange = () => {
			if (!document.hidden) {
				fetchConversations();
				if (selectedConversation) {
					fetchMessages(selectedConversation.id, true);
				}
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	}, []);

	useEffect(() => {
		if (selectedConversation) {
			fetchMessages(selectedConversation.id);
		}
	}, [selectedConversation]);

	useEffect(() => {
		if (shouldAutoScrollRef.current) {
			scrollToBottom();
		}
	}, [messages]);

	useEffect(() => {
		// La schimbarea conversației vrem să pornim din nou din partea de jos
		shouldAutoScrollRef.current = true;
	}, [selectedConversation?.id]);

	// Polling pentru mesaje noi în conversația activă (fără messages.length în deps — evită resetări repetate ale intervalului)
	useEffect(() => {
		if (!selectedConversation?.id || !user?.id) return;

		const conversationId = selectedConversation.id;

		// Funcție pentru a verifica mesaje noi
		const checkNewMessages = async () => {
			// Nu face polling dacă pagina nu este activă
			if (document.hidden) return;
			if (Date.now() < messagesPollBackoffUntilRef.current) return;

			try {
				const data = await messagesService.getMessages(conversationId);
				
				if (Array.isArray(data) && data.length > 0) {
					const lastMessage = data[data.length - 1];
					
					// Verifică dacă există mesaje noi
					if (lastMessageIdRef.current && lastMessage.id > lastMessageIdRef.current) {
						// Există mesaje noi - actualizează lista
						setMessages(data);
						lastMessageIdRef.current = lastMessage.id;
						
						// Scroll la final doar dacă utilizatorul era deja aproape de bottom
						if (shouldAutoScrollRef.current) {
							setTimeout(() => scrollToBottom(), 100);
						}
						
						// Actualizează conversația cu ultimul mesaj
						setConversations(prev => prev.map(conv => 
							conv.id === conversationId
								? {
									...conv,
									lastMessage: {
										content: lastMessage.content,
										created_at: lastMessage.created_at,
										sender_id: lastMessage.sender_id,
									},
									updated_at: lastMessage.created_at,
								}
								: conv
						));
					} else if (!lastMessageIdRef.current) {
						// Prima încărcare
						setMessages(data);
						if (data.length > 0) {
							lastMessageIdRef.current = data[data.length - 1].id;
						}
					}
				}
		} catch (err) {
			if (err?.response?.status === 429) {
				messagesPollBackoffUntilRef.current = Date.now() + 120000;
			}
			logger.error('Error polling messages:', err);
			}
		};

		// Polling mesaje active (6s) + backoff la 429
		pollingIntervalRef.current = setInterval(checkNewMessages, 6000);

		return () => {
			if (pollingIntervalRef.current) {
				clearInterval(pollingIntervalRef.current);
			}
		};
	}, [selectedConversation?.id, user?.id]);

	// Polling pentru actualizarea conversațiilor (ultimul mesaj, contor necitite)
	useEffect(() => {
		if (!user) return;

		const updateConversations = async () => {
			// Nu face polling dacă pagina nu este activă
			if (document.hidden) return;
			if (Date.now() < conversationsPollBackoffUntilRef.current) return;

			try {
				const data = await messagesService.getConversations();
				
					if (Array.isArray(data)) {
						// Actualizează conversațiile, păstrând selecția curentă
						const currentSelectedId = selectedConversation?.id;
						const updated = data.map(newConv => {
							const existing = conversations.find(c => c.id === newConv.id);
							// Păstrează conversația selectată dacă există
							if (existing && existing.id === currentSelectedId) {
								return existing;
							}
							return newConv;
						});
						
						// Dacă conversația selectată nu mai există, o eliminăm
						if (currentSelectedId && !updated.find(c => c.id === currentSelectedId)) {
							setSelectedConversation(null);
						}
						
						// Update both conversations and allConversations
						setAllConversations(updated);
						// Only update displayed conversations if not searching
						if (!searchQuery.trim()) {
							setConversations(updated);
						}
					}
		} catch (err) {
			if (err?.response?.status === 429) {
				conversationsPollBackoffUntilRef.current = Date.now() + 120000;
				messagesPollBackoffUntilRef.current = Date.now() + 120000;
			}
			logger.error('Error polling conversations:', err);
			}
		};

		// Lista conversații (15s) + backoff la 429
		conversationsPollingRef.current = setInterval(updateConversations, 15000);

		return () => {
			if (conversationsPollingRef.current) {
				clearInterval(conversationsPollingRef.current);
			}
		};
	}, [user?.id, selectedConversation?.id]);

	const scrollToBottom = (behavior = 'smooth') => {
		messagesEndRef.current?.scrollIntoView({ behavior });
	};

	const handleMessagesScroll = () => {
		const container = messagesContainerRef.current;
		if (!container) return;
		const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
		shouldAutoScrollRef.current = distanceFromBottom < 100;
	};

	const fetchConversations = async () => {
		try {
			setLoading(true);
			setLoadError(null);
			const data = await messagesService.getConversations();
			
			if (Array.isArray(data)) {
				setConversations(data);
				setAllConversations(data); // Store all conversations for search
				if (!selectedConversation && data.length > 0) {
					setSelectedConversation(data[0]);
				}
			} else {
				setConversations([]);
				setAllConversations([]);
			}
		} catch (err) {
			const msg = err?.response?.data?.message || err?.message || 'Eroare la încărcarea conversațiilor';
			setLoadError(msg);
			showToast(msg, 'error');
			setConversations([]);
			setAllConversations([]);
		} finally {
			setLoading(false);
		}
	};

	const fetchMessages = async (conversationId, silent = false) => {
		if (!conversationId) return;
		
		try {
			const data = await messagesService.getMessages(conversationId);
			
			if (Array.isArray(data)) {
				setMessages(data);
				// Setăm ultimul mesaj ID pentru polling
				if (data.length > 0) {
					lastMessageIdRef.current = data[data.length - 1].id;
				} else {
					lastMessageIdRef.current = null;
				}
			} else {
				setMessages([]);
				lastMessageIdRef.current = null;
			}
			
			// Mark conversation as read
			if (conversationId) {
				await messagesService.markAsRead(conversationId);
				applyConversationReadLocally(conversationId);
			}
		} catch (err) {
			logger.error('Error fetching messages:', err);
			if (!silent) {
				showToast('Eroare la încărcarea mesajelor', 'error');
			}
			setMessages([]);
			lastMessageIdRef.current = null;
		}
	};

	const handleSendMessage = async (e) => {
		e.preventDefault();
		if (!newMessage.trim() || sending || !selectedConversation) return;

		const messageContent = newMessage.trim();
		const tempId = Date.now();
		setNewMessage('');
		setSending(true);

		// Optimistically add message to UI
		const optimisticMessage = {
			id: tempId,
			content: messageContent,
			sender_id: user.id,
			created_at: new Date().toISOString()
		};
		
		setMessages(prev => [...prev, optimisticMessage]);
		
		// Update conversation last message
		setConversations(prev => prev.map(conv => 
			conv.id === selectedConversation.id
				? {
					...conv,
					lastMessage: {
						content: messageContent,
						created_at: new Date().toISOString(),
						sender_id: user.id
					},
					updated_at: new Date().toISOString()
				}
				: conv
		));

		try {
			const sentMessage = await messagesService.sendMessage(selectedConversation.id, messageContent);
			
			// Replace optimistic message with real one from server
			if (sentMessage && sentMessage.id) {
				setMessages(prev => prev.map(msg => 
					msg.id === tempId ? sentMessage : msg
				));
				lastMessageIdRef.current = sentMessage.id;
			}
			
			// Actualizează conversațiile local fără refresh vizual
			// Nu apelăm fetchConversations() pentru a evita refresh-ul vizual
			// Conversațiile se actualizează deja prin optimistic update și polling
		} catch (err) {
			logger.error('Error sending message:', err);
			// Remove optimistic message on error
			setMessages(prev => prev.filter(msg => msg.id !== tempId));
			showToast('Eroare la trimiterea mesajului', 'error');
			setNewMessage(messageContent); // Restore message on error
		} finally {
			setSending(false);
		}
	};

	const formatTime = (dateString) => {
		const date = new Date(dateString);
		const now = new Date();
		const diff = now - date;
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'Acum';
		if (minutes < 60) return `Acum ${minutes} min`;
		if (hours < 24) return `Acum ${hours}h`;
		if (days < 7) return `${days} zile`;
		return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
	};

	const getInitials = (name) => {
		return name
			.split(' ')
			.map(n => n[0])
			.join('')
			.toUpperCase()
			.substring(0, 2);
	};

	const getConversationTitle = (conversation) => {
		if (conversation?.is_group) {
			return conversation?.name || 'Grup fără nume';
		}
		return conversation?.participant?.name || 'Utilizator necunoscut';
	};

	const getConversationAvatarText = (conversation) => {
		if (conversation?.is_group) return 'GR';
		return getInitials(conversation?.participant?.name || 'U');
	};

	const getConversationSubtitle = (conversation) => {
		if (conversation?.is_group) {
			const count = Array.isArray(conversation?.participants) ? conversation.participants.length : 0;
			return `${count} participanți`;
		}
		return conversation?.participant?.role === 'admin' ? 'Administrator'
			: conversation?.participant?.role === 'instructor' ? 'Instructor'
			: 'Student';
	};

	const getConversationMessages = (conversation) => {
		if (!conversation) return [];
		return [
			...(Array.isArray(conversation.messages) ? conversation.messages : []),
			...(Array.isArray(conversation.conversation_messages) ? conversation.conversation_messages : []),
			...(Array.isArray(conversation.conversationMessages) ? conversation.conversationMessages : []),
		];
	};

	const getMessageTimestamp = (message) => {
		if (!message) return 0;
		const candidates = [
			message.created_at,
			message.createdAt,
			message.sent_at,
			message.sentAt,
			message.updated_at,
			message.updatedAt,
		];

		for (const candidate of candidates) {
			if (!candidate) continue;
			const timestamp = new Date(candidate).getTime();
			if (Number.isFinite(timestamp)) return timestamp;
		}

		const fallbackId = Number(message.id);
		return Number.isFinite(fallbackId) ? fallbackId : 0;
	};

	const getConversationLastMessage = (conversation) => {
		const directCandidates = [
			conversation?.lastMessage,
			conversation?.last_message,
			conversation?.latest_message,
			conversation?.latestMessage,
		].filter(Boolean);
		const nestedMessages = getConversationMessages(conversation).filter(Boolean);
		const allCandidates = [...directCandidates, ...nestedMessages];
		if (!allCandidates.length) return null;
		return allCandidates.slice().sort((a, b) => getMessageTimestamp(a) - getMessageTimestamp(b)).at(-1) || null;
	};

	const getConversationPreviewText = (conversation) => {
		const lastMessage = getConversationLastMessage(conversation);
		return String(lastMessage?.content ?? lastMessage?.message ?? lastMessage?.text ?? '').trim();
	};

	const getConversationUnreadCount = (conversation) => {
		const directValues = [
			conversation?.unreadCount,
			conversation?.unread_count,
			conversation?.unread_messages_count,
			conversation?.unreadMessagesCount,
			conversation?.new_messages_count,
		];

		for (const value of directValues) {
			const count = Number(value);
			if (Number.isFinite(count)) return Math.max(0, count);
		}

		return getConversationMessages(conversation).reduce((total, message) => {
			const unreadFlag = message?.is_unread ?? message?.isUnread ?? message?.unread ?? false;
			return total + (unreadFlag ? 1 : 0);
		}, 0);
	};

	const getConversationUpdatedAt = (conversation) => {
		const lastMessage = getConversationLastMessage(conversation);
		return conversation?.updated_at || conversation?.updatedAt || conversation?.last_message_at || conversation?.lastMessageAt || lastMessage?.created_at || lastMessage?.createdAt || null;
	};

	const applyConversationReadLocally = (conversationId) => {
		const id = String(conversationId);
		const clearUnread = (conversation) => conversation && String(conversation.id) === id
			? {
				...conversation,
				unreadCount: 0,
				unread_count: 0,
				unread_messages_count: 0,
				unreadMessagesCount: 0,
			}
			: conversation;

		setConversations((prev) => prev.map(clearUnread));
		setAllConversations((prev) => prev.map(clearUnread));
		setSelectedConversation((prev) => (prev ? clearUnread(prev) : prev));
		window.dispatchEvent(new CustomEvent('formely:conversation-read', { detail: { conversationId: id } }));
	};

	const getGroupParticipantsLabel = (conversation) => {
		if (!conversation?.is_group || !Array.isArray(conversation?.participants)) {
			return '';
		}
		const names = conversation.participants
			.map((p) => p?.name)
			.filter(Boolean);
		return names.join(', ');
	};

	const handleSearch = async (query) => {
		setSearchQuery(query);
		
		// If query is empty, restore all conversations without fetching
		if (!query.trim()) {
			setConversations(allConversations);
			return;
		}

		try {
			const results = await messagesService.searchConversations(query);
			if (Array.isArray(results) && results.length > 0) {
				setConversations(results);
			} else {
				// Filter local conversations if API doesn't return results
				const filtered = allConversations.filter(conv => 
				getConversationTitle(conv).toLowerCase().includes(query.toLowerCase()) ||
				getConversationPreviewText(conv).toLowerCase().includes(query.toLowerCase())
			);
				setConversations(filtered);
			}
		} catch (err) {
			logger.error('Error searching conversations:', err);
			// Fallback to local filtering
			const filtered = allConversations.filter(conv => 
				getConversationTitle(conv).toLowerCase().includes(query.toLowerCase()) ||
				getConversationPreviewText(conv).toLowerCase().includes(query.toLowerCase())
			);
			setConversations(filtered);
		}
	};

	const handleNewConversation = async () => {
		if (newConversationType === 'direct' && !newConversationUserId) {
			showToast('Selectează un utilizator', 'error');
			return;
		}
		if (newConversationType === 'group' && newConversationUserIds.length < 2) {
			showToast('Selectează cel puțin 2 participanți pentru grup', 'error');
			return;
		}

		try {
			const payload = newConversationType === 'group'
				? {
					type: 'group',
					name: newGroupName?.trim() || 'Grup nou',
					participant_ids: newConversationUserIds,
				}
				: {
					type: 'direct',
					participant_id: newConversationUserId,
				};
			const conversation = await messagesService.createConversation(payload);
			setConversations(prev => [conversation, ...prev]);
			setSelectedConversation(conversation);
			setShowNewConversationModal(false);
			setNewConversationType('direct');
			setNewGroupName('');
			setNewConversationUserId('');
			setNewConversationUserIds([]);
			setNewConversationSearch('');
			setAvailableUsers([]);
			showToast('Conversație creată', 'success');
		} catch (err) {
			logger.error('Error creating conversation:', err);
			const errorMessage = err.response?.data?.message || err.message || 'Eroare la crearea conversației';
			showToast(errorMessage, 'error');
		}
	};

	const handleSearchUsers = async (query) => {
		setNewConversationSearch(query);
		if (!query.trim()) {
			setAvailableUsers([]);
			return;
		}

		setLoadingUsers(true);
		try {
			const users = await messagesService.getAvailableUsers(query);
			setAvailableUsers(users);
		} catch (err) {
			logger.error('Error searching users:', err);
			setAvailableUsers([]);
		} finally {
			setLoadingUsers(false);
		}
	};

	const handleSelectUser = (userId) => {
		if (newConversationType === 'group') {
			setNewConversationUserIds((prev) => (
				prev.includes(userId)
					? prev.filter((id) => id !== userId)
					: [...prev, userId]
			));
		} else {
			setNewConversationUserId(userId);
		}
		setNewConversationSearch('');
		setAvailableUsers([]);
	};

	const loadGroupParticipants = async (conversationId) => {
		setLoadingParticipants(true);
		try {
			const res = await messagesService.getParticipants(conversationId);
			setGroupParticipants(Array.isArray(res?.data) ? res.data : []);
		} catch (err) {
			logger.error('Error loading group participants:', err);
			showToast('Nu s-au putut încărca participanții', 'error');
		} finally {
			setLoadingParticipants(false);
		}
	};

	const openParticipantsModal = async () => {
		if (!selectedConversation?.is_group) return;
		setShowParticipantsModal(true);
		setGroupRenameDraft(selectedConversation.name || '');
		setParticipantsSearch('');
		setParticipantsSearchResults([]);
		await loadGroupParticipants(selectedConversation.id);
	};

	const groupModalPermissions = useMemo(() => {
		const me = groupParticipants.find((p) => p.id === user?.id);
		const iAmOwner = Boolean(me?.is_owner || me?.group_role === 'owner');
		const iAmGroupAdmin = Boolean(me?.is_group_admin || me?.group_role === 'admin');
		const siteAdmin = user?.role === 'admin';
		return {
			canManageGroup: siteAdmin || iAmOwner || iAmGroupAdmin,
			canManageRoles: siteAdmin || iAmOwner,
			iAmOwner,
		};
	}, [groupParticipants, user?.id, user?.role]);

	const groupRoleLabel = (p) => {
		if (p.is_owner || p.group_role === 'owner') return 'Proprietar';
		if (p.is_group_admin || p.group_role === 'admin') return 'Admin grup';
		return 'Membru';
	};

	const handleSaveGroupName = async () => {
		if (!selectedConversation?.id) return;
		const name = groupRenameDraft.trim();
		if (!name) {
			showToast('Introdu un nume pentru grup.', 'error');
			return;
		}
		setUpdatingParticipants(true);
		try {
			const res = await messagesService.updateGroupConversation(selectedConversation.id, name);
			const newName = res?.data?.name ?? name;
			setConversations((prev) => prev.map((c) => (c.id === selectedConversation.id ? { ...c, name: newName } : c)));
			setSelectedConversation((prev) => (prev ? { ...prev, name: newName } : prev));
			setGroupRenameDraft(newName);
			showToast('Numele grupului a fost actualizat.', 'success');
		} catch (err) {
			logger.error('Error renaming group:', err);
			showToast(err?.response?.data?.message || 'Nu s-a putut redenumi grupul', 'error');
		} finally {
			setUpdatingParticipants(false);
		}
	};

	const handleLeaveGroup = async () => {
		if (!selectedConversation?.id) return;
		setLeavingGroup(true);
		try {
			await messagesService.leaveGroup(selectedConversation.id);
			const leftId = selectedConversation.id;
			setShowLeaveGroupConfirm(false);
			setShowParticipantsModal(false);
			setConversations((prev) => prev.filter((c) => c.id !== leftId));
			setAllConversations((prev) => prev.filter((c) => c.id !== leftId));
			setSelectedConversation((prev) => (prev?.id === leftId ? null : prev));
			showToast('Ai părăsit grupul.', 'success');
		} catch (err) {
			logger.error('Error leaving group:', err);
			showToast(err?.response?.data?.message || 'Nu ai putut părăsi grupul', 'error');
		} finally {
			setLeavingGroup(false);
		}
	};

	const handleDeleteConversation = async () => {
		if (!selectedConversation?.id) return;
		setDeletingConversation(true);
		try {
			const removedId = selectedConversation.id;
			await messagesService.deleteConversation(removedId);
			setShowDeleteConversationConfirm(false);
			setShowParticipantsModal(false);
			setConversations((prev) => prev.filter((c) => c.id !== removedId));
			setAllConversations((prev) => prev.filter((c) => c.id !== removedId));
			setSelectedConversation((prev) => (prev?.id === removedId ? null : prev));
			showToast(selectedConversation?.is_group ? 'Grupul a fost șters.' : 'Conversația a fost ștearsă.', 'success');
		} catch (err) {
			logger.error('Error deleting conversation:', err);
			showToast(err?.response?.data?.message || 'Nu s-a putut șterge conversația', 'error');
		} finally {
			setDeletingConversation(false);
		}
	};

	const handleSetParticipantRole = async (targetUserId, groupRole) => {
		if (!selectedConversation?.id) return;
		setUpdatingParticipants(true);
		try {
			const res = await messagesService.setParticipantGroupRole(selectedConversation.id, targetUserId, groupRole);
			const updatedParticipants = Array.isArray(res?.data) ? res.data : [];
			setGroupParticipants(updatedParticipants);
			setConversations((prev) => prev.map((conv) => (conv.id === selectedConversation.id ? {
				...conv,
				participants: updatedParticipants.filter((p) => p.id !== user.id),
			} : conv)));
			setSelectedConversation((prev) => (prev ? {
				...prev,
				participants: updatedParticipants.filter((p) => p.id !== user.id),
			} : prev));
			showToast('Rol actualizat.', 'success');
		} catch (err) {
			logger.error('Error updating participant role:', err);
			showToast(err?.response?.data?.message || 'Nu s-a putut actualiza rolul', 'error');
		} finally {
			setUpdatingParticipants(false);
		}
	};

	const handleParticipantsSearch = async (query) => {
		setParticipantsSearch(query);
		if (!query.trim()) {
			setParticipantsSearchResults([]);
			return;
		}
		try {
			const users = await messagesService.getAvailableUsers(query);
			const existingIds = new Set(groupParticipants.map((p) => p.id));
			const filtered = (Array.isArray(users) ? users : []).filter((u) => !existingIds.has(u.id));
			setParticipantsSearchResults(filtered);
		} catch (err) {
			logger.error('Error searching users for group:', err);
			setParticipantsSearchResults([]);
		}
	};

	const handleAddParticipantToGroup = async (userId) => {
		if (!selectedConversation?.id) return;
		setUpdatingParticipants(true);
		try {
			const res = await messagesService.addParticipants(selectedConversation.id, [userId]);
			const updatedParticipants = Array.isArray(res?.data) ? res.data : [];
			setGroupParticipants(updatedParticipants);
			setParticipantsSearchResults((prev) => prev.filter((u) => u.id !== userId));
			setConversations((prev) => prev.map((conv) => conv.id === selectedConversation.id ? {
				...conv,
				participants: updatedParticipants.filter((p) => p.id !== user.id),
			} : conv));
			setSelectedConversation((prev) => prev ? {
				...prev,
				participants: updatedParticipants.filter((p) => p.id !== user.id),
			} : prev);
			showToast('Participant adăugat', 'success');
		} catch (err) {
			logger.error('Error adding participant:', err);
			showToast(err?.response?.data?.message || 'Nu s-a putut adăuga participantul', 'error');
		} finally {
			setUpdatingParticipants(false);
		}
	};

	const handleRemoveParticipantFromGroup = async (targetUserId) => {
		if (!selectedConversation?.id) return;
		setUpdatingParticipants(true);
		try {
			const res = await messagesService.removeParticipant(selectedConversation.id, targetUserId);
			const updatedParticipants = Array.isArray(res?.data) ? res.data : [];
			setGroupParticipants(updatedParticipants);
			setConversations((prev) => prev.map((conv) => conv.id === selectedConversation.id ? {
				...conv,
				participants: updatedParticipants.filter((p) => p.id !== user.id),
			} : conv));
			setSelectedConversation((prev) => prev ? {
				...prev,
				participants: updatedParticipants.filter((p) => p.id !== user.id),
			} : prev);
			showToast('Participant eliminat', 'success');
		} catch (err) {
			logger.error('Error removing participant:', err);
			showToast(err?.response?.data?.message || 'Nu s-a putut elimina participantul', 'error');
		} finally {
			setUpdatingParticipants(false);
		}
	};

	// Filter conversations based on search query
	const filteredConversations = searchQuery.trim()
		? conversations.filter(conv => {
			const title = getConversationTitle(conv).toLowerCase();
			const preview = getConversationPreviewText(conv).toLowerCase();
			return title.includes(searchQuery.toLowerCase()) || preview.includes(searchQuery.toLowerCase());
		})
		: conversations;

	if (loading && !loadError) {
		return (
			<div className="messages-page">
				<div className="lms-dashboard-loading">
					<div className="lms-spinner"></div>
					<p>Se încarcă mesageria...</p>
				</div>
			</div>
		);
	}

	if (loadError) {
		return (
			<div className="messages-page">
				<div className="messages-page-error">
					<div className="messages-page-error-icon" aria-hidden>
						<WarningCircle size={24} weight="duotone" />
					</div>
					<h2 className="messages-page-error-title">Nu s-au putut încărca conversațiile</h2>
					<p className="messages-page-error-message">{loadError}</p>
					<button
						type="button"
						className="lms-btn-primary"
						onClick={() => fetchConversations()}
						aria-label="Încearcă din nou"
					>
						Încearcă din nou
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="messages-page">
			<div className="messages-container">
				{/* Conversations Sidebar - Hidden on mobile when conversation is selected */}
				<div className={`messages-sidebar ${isMobile && selectedConversation ? 'mobile-hidden' : ''}`}>
					<div className="messages-sidebar-header">
						<h2 className="messages-title">Mesagerie</h2>
						<button 
							className="messages-new-conversation-btn" 
							title="Conversație nouă"
							onClick={() => setShowNewConversationModal(true)}
						>
							<Plus size={18} weight="bold" aria-hidden />
						</button>
					</div>

					<div className="messages-search">
						<input
							type="text"
							placeholder="Caută conversații..."
							className="messages-search-input"
							value={searchQuery}
							onChange={(e) => handleSearch(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									e.stopPropagation();
								}
							}}
						/>
					</div>

					<div className="messages-conversations-list">
						{filteredConversations.length === 0 && !loading ? (
							<div className="lms-empty-state" style={{ padding: 'var(--space-4)', textAlign: 'center', background: 'transparent', border: 'none' }}>
								<div className="lms-empty-description" style={{ margin: 0 }}>
									{searchQuery ? 'Nu s-au găsit conversații' : 'Nu există conversații'}
								</div>
							</div>
						) : (
							filteredConversations.map((conversation) => (
							<div
								key={conversation.id}
								className={`messages-conversation-item ${
									selectedConversation?.id === conversation.id ? 'active' : ''
								} ${getConversationUnreadCount(conversation) > 0 ? 'unread' : ''}`}
								onClick={() => {
									applyConversationReadLocally(conversation.id);
									setSelectedConversation({
										...conversation,
										unreadCount: 0,
									});
									// On mobile, this will hide the sidebar and show the conversation
								}}
							>
								<div className="messages-conversation-avatar">
									{!conversation.is_group && conversation.participant?.avatar ? (
										<img src={toImageUrl(conversation.participant.avatar) || conversation.participant.avatar} alt={getConversationTitle(conversation)} loading="lazy" decoding="async" />
									) : (
										<span>{getConversationAvatarText(conversation)}</span>
									)}
								</div>
								<div className="messages-conversation-content">
									<div className="messages-conversation-header">
										<span className="messages-conversation-name">
											{getConversationTitle(conversation)}
										</span>
										<span className="messages-conversation-time">
											{conversation.lastMessage?.created_at 
												? formatTime(conversation.lastMessage.created_at)
												: conversation.updated_at 
													? formatTime(conversation.updated_at)
													: 'Recentă'}
										</span>
									</div>
									<div className="messages-conversation-preview">
										<span className="messages-conversation-text">
											{conversation.lastMessage?.content || 'Fără mesaje'}
										</span>
										{getConversationUnreadCount(conversation) > 0 && (
											<span className="messages-unread-meta">
												<span className="messages-unread-dot" aria-hidden="true" />
												<span className="messages-unread-badge">
													{getConversationUnreadCount(conversation) > 99 ? '99+' : getConversationUnreadCount(conversation)}
												</span>
											</span>
										)}
									</div>
								</div>
							</div>
						)))}
					</div>
				</div>

				{/* Messages Area - Hidden on mobile when no conversation is selected */}
				<div className={`messages-main ${isMobile && !selectedConversation ? 'mobile-hidden' : ''}`}>
					{selectedConversation ? (
						<>
							{/* Chat Header */}
							<div className="messages-chat-header">
								{isMobile && (
									<button 
										className="messages-chat-back-btn"
										onClick={() => setSelectedConversation(null)}
										title="Înapoi la conversații"
										aria-label="Înapoi la conversații"
									>
										<ArrowLeft size={24} weight="bold" aria-hidden />
									</button>
								)}
								<div className="messages-chat-header-info">
									<div className="messages-chat-avatar">
										{!selectedConversation.is_group && selectedConversation.participant?.avatar ? (
											<img src={toImageUrl(selectedConversation.participant.avatar) || selectedConversation.participant.avatar} alt={getConversationTitle(selectedConversation)} loading="lazy" decoding="async" />
										) : (
											<span>{getConversationAvatarText(selectedConversation)}</span>
										)}
									</div>
									<div>
										<h3 className="messages-chat-name">{getConversationTitle(selectedConversation)}</h3>
										<p className="messages-chat-role">
											{getConversationSubtitle(selectedConversation)}
										</p>
										{selectedConversation?.is_group && (
											<p className="messages-chat-role" style={{ marginTop: '4px' }}>
												Participanți: {getGroupParticipantsLabel(selectedConversation) || 'N/A'}
											</p>
										)}
									</div>
								</div>
								<button
									type="button"
									className="messages-chat-actions-btn va-btn-danger"
									title={selectedConversation?.is_group ? 'Șterge grupul' : 'Șterge conversația'}
									aria-label={selectedConversation?.is_group ? 'Șterge grupul' : 'Șterge conversația'}
									onClick={() => setShowDeleteConversationConfirm(true)}
								>
									<Trash size={18} weight="bold" aria-hidden />
								</button>
							</div>

							{/* Messages List */}
							<div
								ref={messagesContainerRef}
								className="messages-chat-messages"
								onScroll={handleMessagesScroll}
							>
								{messages.length > 0 ? (
									messages.map((message) => {
										const isOwn = message.sender_id === user?.id;
										return (
											<div
												key={message.id}
												className={`messages-message ${isOwn ? 'own' : 'other'}`}
											>
												<div className="messages-message-content">
													<p>{message.content || ''}</p>
													<span className="messages-message-time">
														{message.created_at 
															? formatTime(message.created_at)
															: 'Acum'}
													</span>
												</div>
											</div>
										);
									})
								) : (
									<div className="lms-empty-state" style={{ padding: 'var(--space-8)' }}>
										<div className="lms-empty-icon">
											<ChatCircleText size={28} weight="duotone" aria-hidden />
										</div>
										<div className="lms-empty-title">Nu există mesaje</div>
										<div className="lms-empty-description">Începe conversația trimitând primul mesaj</div>
									</div>
								)}
								<div ref={messagesEndRef} />
							</div>

							{/* Message Input */}
							<form className="messages-chat-input-form" onSubmit={handleSendMessage}>
								<input
									type="text"
									className="messages-chat-input"
									value={newMessage}
									onChange={(e) => setNewMessage(e.target.value)}
									placeholder="Scrie un mesaj..."
									disabled={sending}
								/>
								<button
									type="submit"
									className="messages-chat-send-btn"
									disabled={!newMessage.trim() || sending}
								>
									{sending ? <CircleNotch size={16} weight="bold" aria-hidden /> : <PaperPlaneTilt size={16} weight="fill" aria-hidden />}
								</button>
							</form>
						</>
					) : (
						<div className="lms-empty-state">
							<div className="lms-empty-icon">
								<ChatCircleText size={28} weight="duotone" aria-hidden />
							</div>
							<div className="lms-empty-title">Selectează o conversație</div>
							<div className="lms-empty-description">Selectează o conversație din listă pentru a începe să trimiți mesaje</div>
						</div>
					)}
				</div>
			</div>

			{/* New Conversation Modal */}
			{showNewConversationModal && (
				<div className="messages-modal-overlay" onClick={() => {
					setShowNewConversationModal(false);
					setNewConversationType('direct');
					setNewGroupName('');
					setNewConversationUserId('');
					setNewConversationUserIds([]);
					setNewConversationSearch('');
					setAvailableUsers([]);
				}}>
					<div className="messages-modal" onClick={(e) => e.stopPropagation()}>
						<div className="messages-modal-header">
							<h3>Conversație nouă</h3>
							<button 
								className="messages-modal-close"
								onClick={() => {
									setShowNewConversationModal(false);
									setNewConversationType('direct');
									setNewGroupName('');
									setNewConversationUserId('');
									setNewConversationUserIds([]);
									setNewConversationSearch('');
									setAvailableUsers([]);
								}}
							>
								<X size={16} weight="bold" aria-hidden />
							</button>
						</div>
						<div className="messages-modal-body">
							<div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
								<button
									type="button"
									className={`lms-btn-secondary ${newConversationType === 'direct' ? 'active' : ''}`}
									onClick={() => {
										setNewConversationType('direct');
										setNewConversationUserIds([]);
										setNewGroupName('');
									}}
								>
									Direct
								</button>
								<button
									type="button"
									className={`lms-btn-secondary ${newConversationType === 'group' ? 'active' : ''}`}
									onClick={() => {
										setNewConversationType('group');
										setNewConversationUserId('');
									}}
								>
									Grup
								</button>
							</div>
							{newConversationType === 'group' && (
								<input
									type="text"
									placeholder="Nume grup"
									className="messages-modal-input"
									value={newGroupName}
									onChange={(e) => setNewGroupName(e.target.value)}
									style={{ marginBottom: 'var(--space-3)' }}
								/>
							)}
							<div style={{ position: 'relative' }}>
								<input
									type="text"
									placeholder={newConversationType === 'group'
										? 'Caută participanți pentru grup...'
										: 'Caută utilizator după nume sau email...'}
									className="messages-modal-input"
									value={newConversationSearch}
									onChange={(e) => handleSearchUsers(e.target.value)}
									autoFocus
								/>
								{loadingUsers && (
									<div style={{ 
										position: 'absolute', 
										right: 'var(--space-3)', 
										top: '50%', 
										transform: 'translateY(-50%)',
										color: 'var(--text-muted)'
									}}>
										<CircleNotch size={14} weight="bold" aria-hidden />
									</div>
								)}
							</div>
							
							{availableUsers.length > 0 && (
								<div className="messages-users-list">
									{availableUsers.map((user) => (
										<div
											key={user.id}
											className={`messages-user-item ${
												newConversationType === 'group'
													? (newConversationUserIds.includes(user.id) ? 'selected' : '')
													: (newConversationUserId == user.id ? 'selected' : '')
											}`}
											onClick={() => handleSelectUser(user.id)}
										>
											<div className="messages-user-avatar">
												{user.avatar ? (
													<img src={toImageUrl(user.avatar) || user.avatar} alt={user.name} loading="lazy" decoding="async" />
												) : (
													<span>{getInitials(user.name)}</span>
												)}
											</div>
											<div className="messages-user-info">
												<div className="messages-user-name">{user.name}</div>
												<div className="messages-user-email">{user.email}</div>
												{user.role && (
													<div className="messages-user-role">
														{user.role === 'admin' ? 'Administrator' :
														 user.role === 'instructor' ? 'Instructor' : 'Student'}
													</div>
												)}
											</div>
											{((newConversationType === 'group' && newConversationUserIds.includes(user.id)) ||
												(newConversationType === 'direct' && newConversationUserId == user.id)) && (
												<div className="messages-user-check">
													<Check size={14} weight="bold" aria-hidden />
												</div>
											)}
										</div>
									))}
								</div>
							)}
							
							{newConversationSearch && !loadingUsers && availableUsers.length === 0 && (
								<p style={{ 
									fontSize: 'var(--font-size-xs)', 
									color: 'var(--text-muted)', 
									marginTop: 'var(--space-2)',
									textAlign: 'center'
								}}>
									Nu s-au găsit utilizatori
								</p>
							)}
							
							{newConversationType === 'direct' && newConversationUserId && (
								<div style={{ 
									marginTop: 'var(--space-3)',
									padding: 'var(--space-2)',
									background: 'var(--bg-tertiary)',
									borderRadius: 'var(--radius-md)',
									fontSize: 'var(--font-size-sm)',
									color: 'var(--text-secondary)'
								}}>
									Utilizator selectat: {availableUsers.find(u => u.id == newConversationUserId)?.name || 'ID: ' + newConversationUserId}
								</div>
							)}
							{newConversationType === 'group' && newConversationUserIds.length > 0 && (
								<div style={{ 
									marginTop: 'var(--space-3)',
									padding: 'var(--space-2)',
									background: 'var(--bg-tertiary)',
									borderRadius: 'var(--radius-md)',
									fontSize: 'var(--font-size-sm)',
									color: 'var(--text-secondary)'
								}}>
									Participanți selectați: {newConversationUserIds.length}
								</div>
							)}
						</div>
						<div className="messages-modal-footer">
							<button 
								className="lms-btn-secondary"
								onClick={() => {
									setShowNewConversationModal(false);
									setNewConversationType('direct');
									setNewGroupName('');
									setNewConversationUserId('');
									setNewConversationUserIds([]);
									setNewConversationSearch('');
									setAvailableUsers([]);
								}}
							>
								Anulează
							</button>
							<button 
								className="lms-btn-primary"
								onClick={handleNewConversation}
								disabled={newConversationType === 'group'
									? newConversationUserIds.length < 2
									: !newConversationUserId}
							>
								Creează
							</button>
						</div>
					</div>
				</div>
			)}

			{showParticipantsModal && selectedConversation?.is_group && (
				<div className="messages-modal-overlay" onClick={() => setShowParticipantsModal(false)}>
					<div className="messages-modal" onClick={(e) => e.stopPropagation()}>
						<div className="messages-modal-header">
							<h3>Participanți grup</h3>
							<button
								className="messages-modal-close"
								onClick={() => setShowParticipantsModal(false)}
							>
								<X size={16} weight="bold" aria-hidden />
							</button>
						</div>
						<div className="messages-modal-body">
							{groupModalPermissions.canManageGroup && (
								<div className="messages-group-rename-block">
									<div className="messages-group-participants-title">Numele grupului</div>
									<div className="messages-group-rename-row">
										<input
											type="text"
											className="messages-modal-input"
											value={groupRenameDraft}
											onChange={(e) => setGroupRenameDraft(e.target.value)}
											maxLength={120}
											aria-label="Numele grupului"
										/>
										<button
											type="button"
											className="lms-btn-primary"
											disabled={updatingParticipants}
											onClick={handleSaveGroupName}
										>
											Salvează
										</button>
									</div>
								</div>
							)}

							{!groupModalPermissions.iAmOwner && (
								<div className="messages-group-leave-row">
									<button
										type="button"
										className="lms-btn-secondary messages-group-leave-btn"
										disabled={updatingParticipants || leavingGroup}
										onClick={() => setShowLeaveGroupConfirm(true)}
									>
										Părăsește grupul
									</button>
								</div>
							)}

							{groupModalPermissions.canManageGroup && (
								<input
									type="text"
									placeholder="Caută utilizatori pentru adăugare..."
									className="messages-modal-input"
									value={participantsSearch}
									onChange={(e) => handleParticipantsSearch(e.target.value)}
								/>
							)}

							<div className="messages-group-participants-section">
								<div className="messages-group-participants-title">Participanți actuali</div>
								{loadingParticipants ? (
									<div className="messages-group-participants-empty">Se încarcă...</div>
								) : groupParticipants.length === 0 ? (
									<div className="messages-group-participants-empty">Nu există participanți.</div>
								) : (
									<div className="messages-users-list">
										{groupParticipants.map((p) => {
											const isOwnerRow = Boolean(p.is_owner || p.group_role === 'owner');
											const showRemove = groupModalPermissions.canManageGroup && !isOwnerRow;
											const showRoleActions = groupModalPermissions.canManageRoles && !isOwnerRow && p.id !== user?.id;
											const isAdminRow = Boolean(p.is_group_admin || p.group_role === 'admin');
											const grKey = p.group_role || (p.is_owner ? 'owner' : (isAdminRow ? 'admin' : 'member'));

											return (
												<div key={p.id} className="messages-user-item messages-user-item--with-actions">
													<div className="messages-user-avatar">
														{p.avatar ? <img src={toImageUrl(p.avatar) || p.avatar} alt={p.name} loading="lazy" decoding="async" /> : <span>{getInitials(p.name)}</span>}
													</div>
													<div className="messages-user-info">
														<div className="messages-user-name-row">
															<span className="messages-user-name">{p.name}</span>
															<span className={`messages-group-role-badge messages-group-role-badge--${grKey}`}>
																{groupRoleLabel(p)}
															</span>
														</div>
														<div className="messages-user-email">{p.email}</div>
													</div>
													<div className="messages-user-item-actions">
														{showRoleActions && (
															isAdminRow ? (
																<button
																	type="button"
																	className="lms-btn-secondary"
																	disabled={updatingParticipants}
																	onClick={() => handleSetParticipantRole(p.id, 'member')}
																>
																	Fă membru
																</button>
															) : (
																<button
																	type="button"
																	className="lms-btn-secondary"
																	disabled={updatingParticipants}
																	onClick={() => handleSetParticipantRole(p.id, 'admin')}
																>
																	Fă admin
																</button>
															)
														)}
														{showRemove && (
															<button
																type="button"
																className="lms-btn-secondary"
																disabled={updatingParticipants}
																onClick={() => handleRemoveParticipantFromGroup(p.id)}
															>
																Elimină
															</button>
														)}
													</div>
												</div>
											);
										})}
									</div>
								)}
							</div>

							{groupModalPermissions.canManageGroup && participantsSearchResults.length > 0 && (
								<div className="messages-group-participants-section">
									<div className="messages-group-participants-title">Adaugă participanți</div>
									<div className="messages-users-list">
										{participantsSearchResults.map((p) => (
											<div key={p.id} className="messages-user-item">
												<div className="messages-user-avatar">
													{p.avatar ? <img src={toImageUrl(p.avatar) || p.avatar} alt={p.name} loading="lazy" decoding="async" /> : <span>{getInitials(p.name)}</span>}
												</div>
												<div className="messages-user-info">
													<div className="messages-user-name">{p.name}</div>
													<div className="messages-user-email">{p.email}</div>
												</div>
												<button
													type="button"
													className="lms-btn-primary"
													disabled={updatingParticipants}
													onClick={() => handleAddParticipantToGroup(p.id)}
												>
													Adaugă
												</button>
											</div>
										))}
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			)}

			<ConfirmModal
				open={showLeaveGroupConfirm}
				onClose={() => !leavingGroup && setShowLeaveGroupConfirm(false)}
				onConfirm={handleLeaveGroup}
				title="Părăsești grupul?"
				message="Nu vei mai primi mesaje din această conversație. Poți fi adăugat din nou de un administrator al grupului."
				confirmLabel="Părăsește"
				cancelLabel="Anulare"
				variant="danger"
				loading={leavingGroup}
			/>
			<ConfirmModal
				open={showDeleteConversationConfirm}
				onClose={() => !deletingConversation && setShowDeleteConversationConfirm(false)}
				onConfirm={handleDeleteConversation}
				title={selectedConversation?.is_group ? 'Ștergi grupul?' : 'Ștergi conversația?'}
				message={
					selectedConversation?.is_group
						? 'Această acțiune va șterge definitiv grupul și toate mesajele din el.'
						: 'Această acțiune va șterge definitiv conversația și toate mesajele.'
				}
				confirmLabel={selectedConversation?.is_group ? 'Șterge grupul' : 'Șterge conversația'}
				cancelLabel="Anulare"
				variant="danger"
				loading={deletingConversation}
			/>
		</div>
	);
};

export default MessagesPage;
