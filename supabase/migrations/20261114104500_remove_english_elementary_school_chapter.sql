-- Remove the Class XII English Core chapter "An Elementary School Classroom in a Slum".
-- This chapter had no saved learner progress at the time of removal.
delete from public.syllabus_steps
where subject_id = 'english-core'
  and chapter_id = 'elementary-school-classroom-slum';

-- Keep the remaining English chapter order contiguous after removing chapter 10.
update public.syllabus_steps
set chapter_order = chapter_order - 1
where subject_id = 'english-core'
  and chapter_order > 10;
