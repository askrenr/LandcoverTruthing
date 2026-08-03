-- Constraint verification. Run in the Supabase SQL editor after schema.sql.
-- Every block must report the expected outcome. Nothing is left behind.

do $$
declare
  token uuid := gen_random_uuid();
  ok boolean;
begin
  -- A valid row inserts.
  insert into public.landcover_points (
    session_token, contributor_name, contributor_email,
    latitude, longitude, landcover_class, year,
    floodable, confidence, placement_method
  ) values (
    token, 'Verify Script', 'verify@example.com',
    34.5, -91.0, 'rice', 2023, 'unknown', 'certain', 'map_click'
  );
  raise notice 'PASS: valid row accepted';

  -- Unknown landcover class is rejected.
  ok := false;
  begin
    insert into public.landcover_points (
      session_token, contributor_name, contributor_email,
      latitude, longitude, landcover_class, year,
      floodable, confidence, placement_method
    ) values (
      token, 'Verify Script', 'verify@example.com',
      34.5, -91.0, 'soybeans', 2023, 'unknown', 'certain', 'map_click'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: bad landcover_class was accepted'; end if;
  raise notice 'PASS: unknown landcover_class rejected';

  -- "other" without free text is rejected.
  ok := false;
  begin
    insert into public.landcover_points (
      session_token, contributor_name, contributor_email,
      latitude, longitude, landcover_class, year,
      floodable, confidence, placement_method
    ) values (
      token, 'Verify Script', 'verify@example.com',
      34.5, -91.0, 'other', 2023, 'unknown', 'certain', 'map_click'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: other without class_other was accepted'; end if;
  raise notice 'PASS: other without free text rejected';

  -- Non-"other" class carrying free text is rejected.
  ok := false;
  begin
    insert into public.landcover_points (
      session_token, contributor_name, contributor_email,
      latitude, longitude, landcover_class, class_other, year,
      floodable, confidence, placement_method
    ) values (
      token, 'Verify Script', 'verify@example.com',
      34.5, -91.0, 'rice', 'stale text', 2023, 'unknown', 'certain', 'map_click'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: stale class_other was accepted'; end if;
  raise notice 'PASS: stale class_other rejected';

  -- Year below the 2020 floor is rejected.
  ok := false;
  begin
    insert into public.landcover_points (
      session_token, contributor_name, contributor_email,
      latitude, longitude, landcover_class, year,
      floodable, confidence, placement_method
    ) values (
      token, 'Verify Script', 'verify@example.com',
      34.5, -91.0, 'rice', 2019, 'unknown', 'certain', 'map_click'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: year 2019 was accepted'; end if;
  raise notice 'PASS: year below floor rejected';

  -- Future year is rejected by the trigger (raises a plain exception).
  ok := false;
  begin
    insert into public.landcover_points (
      session_token, contributor_name, contributor_email,
      latitude, longitude, landcover_class, year,
      floodable, confidence, placement_method
    ) values (
      token, 'Verify Script', 'verify@example.com',
      34.5, -91.0, 'rice', extract(year from now())::int + 1,
      'unknown', 'certain', 'map_click'
    );
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: future year was accepted'; end if;
  raise notice 'PASS: future year rejected';

  -- Out-of-range latitude is rejected.
  ok := false;
  begin
    insert into public.landcover_points (
      session_token, contributor_name, contributor_email,
      latitude, longitude, landcover_class, year,
      floodable, confidence, placement_method
    ) values (
      token, 'Verify Script', 'verify@example.com',
      95.0, -91.0, 'rice', 2023, 'unknown', 'certain', 'map_click'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: latitude 95 was accepted'; end if;
  raise notice 'PASS: out-of-range latitude rejected';

  -- gps_accuracy_m without device_gps is rejected.
  ok := false;
  begin
    insert into public.landcover_points (
      session_token, contributor_name, contributor_email,
      latitude, longitude, landcover_class, year,
      floodable, confidence, placement_method, gps_accuracy_m
    ) values (
      token, 'Verify Script', 'verify@example.com',
      34.5, -91.0, 'rice', 2023, 'unknown', 'certain', 'map_click', 4.7
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: stray gps_accuracy_m was accepted'; end if;
  raise notice 'PASS: gps_accuracy_m without device_gps rejected';

  -- Malformed email is rejected.
  ok := false;
  begin
    insert into public.landcover_points (
      session_token, contributor_name, contributor_email,
      latitude, longitude, landcover_class, year,
      floodable, confidence, placement_method
    ) values (
      token, 'Verify Script', 'not-an-email',
      34.5, -91.0, 'rice', 2023, 'unknown', 'certain', 'map_click'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: malformed email was accepted'; end if;
  raise notice 'PASS: malformed email rejected';

  -- Clean up every row this script created.
  delete from public.landcover_points where session_token = token;
  raise notice 'ALL CONSTRAINT CHECKS PASSED';
end;
$$;
