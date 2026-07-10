-- Optional trip start date, so day headers can show real dates and the weather
-- can align to the traveler's dates instead of "next 5 days from now".
alter table trips add column if not exists start_date date;
