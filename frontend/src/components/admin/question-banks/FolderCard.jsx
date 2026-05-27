import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FolderOpen, Star } from 'lucide-react';
import Tag from './Tag';

const FolderCard = ({ folder }) => {
	const tags = Array.isArray(folder?.tags) ? folder.tags : [];
	const questionCount = Number(folder?.questions_count) || 0;
	const starredCount = Number(folder?.starred_questions_count) || 0;

	return (
		<Link className="qb-folder-card" to={`/admin/question-banks/${folder.id}`}>
			<div className="qb-folder-icon" aria-hidden>
				<FolderOpen size={22} />
			</div>

			<div className="qb-folder-body">
				<strong className="qb-folder-title">{folder.title || 'Folder fără nume'}</strong>
				{folder.description ? <p className="qb-folder-description">{folder.description}</p> : null}
				{tags.length ? (
					<div className="qb-folder-tags">
						{tags.slice(0, 4).map((tag) => (
							<Tag key={`${folder.id}-${tag.id || tag.name}`}>{tag.name || tag}</Tag>
						))}
						{tags.length > 4 ? <Tag>+{tags.length - 4}</Tag> : null}
					</div>
				) : null}
			</div>

			<div className="qb-folder-stats">
				<span>{questionCount} întrebări</span>
				<span>
					<Star size={14} aria-hidden />
					{starredCount}
				</span>
			</div>

			<span className="qb-folder-open" aria-hidden>
				<ArrowRight size={18} />
			</span>
		</Link>
	);
};

export default FolderCard;
