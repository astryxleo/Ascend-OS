-- Safe aggregate analytics for the signed-in student's own dashboard and an explicitly selected duel opponent.
-- This function returns only aggregate study metrics; it never returns task titles, exam names, or raw session records.
create or replace function public.get_study_analytics(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  result jsonb;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if p_user_id is null or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'Student not found.';
  end if;

  with
  bounds as (
    select (now() at time zone 'Asia/Kolkata')::date as today,
           date_trunc('week', now() at time zone 'Asia/Kolkata')::date as week_start
  ),
  profile_data as (
    select p.id, coalesce(nullif(p.full_name,''), nullif(p.username,''), 'Student') as display_name,
           p.username, p.avatar_url
    from public.profiles p where p.id=p_user_id
  ),
  focus_days as (
    select gs::date as day,
      coalesce(sum(fs.duration_minutes) filter (where fs.completed),0)::numeric as minutes
    from bounds b cross join generate_series(b.today-29,b.today,interval '1 day') gs
    left join public.focus_sessions fs on fs.user_id=p_user_id and fs.completed=true
      and (fs.ended_at at time zone 'Asia/Kolkata')::date=gs::date
    group by gs::date
  ),
  task_days as (
    select gs::date as day,
      count(t.id)::int as created,
      count(t.id) filter (where t.completed)::int as completed
    from bounds b cross join generate_series(b.today-29,b.today,interval '1 day') gs
    left join public.planner_tasks t on t.user_id=p_user_id and t.study_day=gs::date
    group by gs::date
  ),
  task_14 as (
    select gs::date as day,
      count(t.id) filter (where t.completed)::int as completed,
      count(t.id) filter (where not t.completed)::int as open
    from bounds b cross join generate_series(b.today-13,b.today,interval '1 day') gs
    left join public.planner_tasks t on t.user_id=p_user_id and t.study_day=gs::date
    group by gs::date
  ),
  weekday as (
    select extract(isodow from (fs.ended_at at time zone 'Asia/Kolkata'))::int as dow,
      round(avg(fs.duration_minutes)::numeric,0)::int as minutes
    from public.focus_sessions fs cross join bounds b
    where fs.user_id=p_user_id and fs.completed=true
      and (fs.ended_at at time zone 'Asia/Kolkata')::date between b.today-29 and b.today
    group by 1
  ),
  daily_week as (
    select gs::date as day, coalesce(sum(fs.duration_minutes),0)::int as minutes
    from bounds b cross join generate_series(b.week_start,b.week_start+6,interval '1 day') gs
    left join public.focus_sessions fs on fs.user_id=p_user_id and fs.completed=true
      and (fs.ended_at at time zone 'Asia/Kolkata')::date=gs::date
    group by gs::date
  ),
  subjects(subject_id,label,colour,sort_order) as (
    values ('mathematics','Mathematics','#A855F7',1),
           ('physics','Physics','#06B6D4',2),
           ('chemistry','Chemistry','#10B981',3),
           ('english-core','English','#F97316',4),
           ('computer-science','Computer Science','#3B82F6',5),
           ('yoga','Yoga','#EAB308',6)
  ),
  mastery as (
    select s.subject_id,s.label,s.colour,s.sort_order,
      count(ss.id)::int as total,
      count(cp.step_id) filter (where cp.completed)::int as completed
    from subjects s
    left join public.syllabus_steps ss on ss.subject_id=s.subject_id and ss.is_published=true
    left join public.chapter_progress cp on cp.user_id=p_user_id and cp.step_id=ss.id
    group by s.subject_id,s.label,s.colour,s.sort_order
  ),
  exam_data as (
    select count(*) filter (where e.obtained_marks is not null and e.max_marks>0)::int as exams_taken,
      coalesce(round(avg(100.0*e.obtained_marks/nullif(e.max_marks,0)) filter (where e.obtained_marks is not null and e.max_marks>0),1),0) as average_score
    from public.exams e where e.user_id=p_user_id
  ),
  top_exam_subject as (
    select e.subject, round(avg(100.0*e.obtained_marks/nullif(e.max_marks,0)),1) as score
    from public.exams e where e.user_id=p_user_id and e.obtained_marks is not null and e.max_marks>0
    group by e.subject order by score desc, e.subject limit 1
  ),
  task_summary as (
    select count(*) filter (where t.study_day >= b.today-29)::int as created_30,
      count(*) filter (where t.study_day >= b.today-29 and t.completed)::int as completed_30,
      count(*) filter (where t.study_day >= b.today-6)::int as created_7,
      count(*) filter (where t.study_day >= b.today-6 and t.completed)::int as completed_7,
      count(*) filter (where t.completed)::int as all_completed,
      count(*)::int as all_created
    from public.planner_tasks t cross join bounds b where t.user_id=p_user_id
  ),
  streak_data as (
    select count(*)::int as streak from (
      select d.day from focus_days d cross join bounds b
      where d.minutes>0 and d.day<=b.today
        and not exists (select 1 from focus_days gap where gap.day>d.day and gap.day<=b.today and gap.minutes=0)
    ) q
  )
  select jsonb_build_object(
    'user_id',p.id,'name',p.display_name,'username',p.username,'avatar_url',p.avatar_url,
    'week_goal',least(100,round(100.0*(select coalesce(sum(minutes),0) from daily_week)/840,1)),
    'trees_grown',(select count(*)::int from public.focus_sessions fs cross join bounds b where fs.user_id=p_user_id and fs.completed=true and (fs.ended_at at time zone 'Asia/Kolkata')::date between b.today-29 and b.today),
    'success_rate',case when ts.created_30=0 then 0 else round(100.0*ts.completed_30/ts.created_30,1) end,
    'weekly_success',case when ts.created_7=0 then 0 else round(100.0*ts.completed_7/ts.created_7,1) end,
    'monthly_success',case when ts.created_30=0 then 0 else round(100.0*ts.completed_30/ts.created_30,1) end,
    'overall_success',case when ts.all_created=0 then 0 else round(100.0*ts.all_completed/ts.all_created,1) end,
    'mastery',case when (select coalesce(sum(total),0) from mastery)=0 then 0 else round(100.0*(select coalesce(sum(completed),0) from mastery)/nullif((select sum(total) from mastery),0),1) end,
    'focus_hours',round((select coalesce(sum(minutes),0) from focus_days)/60.0,1),
    'streak',(select streak from streak_data),
    'average_score',ed.average_score,'exams_taken',ed.exams_taken,
    'top_subject',coalesce((select jsonb_build_object('subject',subject,'score',score) from top_exam_subject),'null'::jsonb),
    'focus_days',(select jsonb_agg(jsonb_build_object('date',day,'minutes',minutes,'hours',round(minutes/60.0,2)) order by day) from focus_days),
    'task_days',(select jsonb_agg(jsonb_build_object('date',day,'created',created,'completed',completed,'rate',case when created=0 then 0 else round(100.0*completed/created,1) end) order by day) from task_days),
    'cumulative_days',(select jsonb_agg(jsonb_build_object('date',day,'hours',hours) order by day) from (select day,round(sum(minutes) over(order by day)/60.0,1) as hours from focus_days) c),
    'weekday_minutes',(select jsonb_agg(jsonb_build_object('day',d,'minutes',coalesce(w.minutes,0)) order by d) from generate_series(1,7) d left join weekday w on w.dow=d),
    'daily_week',(select jsonb_agg(jsonb_build_object('date',day,'day',to_char(day,'Dy'),'hours',round(minutes/60.0,2)) order by day) from daily_week),
    'tasks_14',(select jsonb_agg(jsonb_build_object('date',day,'completed',completed,'open',open) order by day) from task_14),
    'sessions_split',jsonb_build_object(
      'grown',(select count(*)::int from public.focus_sessions fs cross join bounds b where fs.user_id=p_user_id and fs.completed=true and (fs.ended_at at time zone 'Asia/Kolkata')::date between b.today-29 and b.today),
      'withered',(select count(*)::int from public.focus_sessions fs cross join bounds b where fs.user_id=p_user_id and fs.completed=false and (fs.ended_at at time zone 'Asia/Kolkata')::date between b.today-29 and b.today)),
    'subjects',(select jsonb_agg(jsonb_build_object('id',subject_id,'name',label,'color',colour,'total',total,'completed',completed,'percent',case when total=0 then 0 else round(100.0*completed/total,1) end) order by sort_order) from mastery)
  ) into result
  from profile_data p cross join exam_data ed cross join task_summary ts;

  return result;
end;
$$;

revoke all on function public.get_study_analytics(uuid) from public, anon;
grant execute on function public.get_study_analytics(uuid) to authenticated;
