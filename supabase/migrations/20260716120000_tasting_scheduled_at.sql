-- A tasting can carry a scheduled date + time (when the group will actually
-- taste). Nullable — plenty of async tastings have no fixed moment.
alter table tastings add column if not exists scheduled_at timestamptz;

-- Tastings already default to status 'DRAFT' (see init schema). Historically
-- the create-tasting action overrode that to 'OPEN' so guessing worked
-- immediately; going forward new tastings stay 'DRAFT' until the host presses
-- Start (moving them to 'IN_PROGRESS'). Legacy rows created as 'OPEN' remain
-- guessable — the app treats anything other than 'DRAFT' as "started".
