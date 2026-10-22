// DSH Bot patch: the slim product. DS Bot's group chats, scheduled/automation tasks,
// DSH Agent entry and the classic Agent mode switch stay in the code but are not
// offered. Flip a flag to bring one back (see NOTICE).
export const LEAN = { groups: false, schedules: false, dshAgent: false, classicMode: false }
