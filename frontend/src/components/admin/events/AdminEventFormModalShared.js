export const DEFAULT_DURATION_MINUTES = 60;

export const emptyEventForm = () => ({
	title: '',
	description: '',
	type: 'live_online',
	event_date: '',
	start_time: '09:00',
	duration_minutes: DEFAULT_DURATION_MINUTES,
	location: '',
	audience_type: 'all',
	team_ids: [],
});
