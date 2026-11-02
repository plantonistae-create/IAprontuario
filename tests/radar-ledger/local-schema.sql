-- Disposable tenant-shaped schema only; no hosted or clinical rows.
CREATE TABLE public.organizations (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,access_status text NOT NULL,clinical_access boolean NOT NULL,is_reviewer boolean NOT NULL
);
CREATE TABLE public.organization_memberships (
  organization_id uuid NOT NULL,user_id uuid NOT NULL,status text NOT NULL,roles text[] NOT NULL,
  PRIMARY KEY (organization_id,user_id)
);
CREATE TABLE public.consultation_history (
  id text PRIMARY KEY,encounter_id uuid NOT NULL,user_id uuid NOT NULL,
  organization_id uuid NOT NULL,encounter_state text NOT NULL
);
INSERT INTO public.organizations VALUES
 ('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
INSERT INTO public.profiles VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','active',true,false),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','active',true,false),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','active',false,true),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','active',false,false);
INSERT INTO public.organization_memberships VALUES
 ('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','active',ARRAY['clinician']),
 ('33333333-3333-4333-8333-333333333333','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','active',ARRAY['clinician']),
 ('22222222-2222-4222-8222-222222222222','cccccccc-cccc-4ccc-8ccc-cccccccccccc','active',ARRAY['reviewer']);
INSERT INTO public.consultation_history VALUES
 ('synthetic-radar-encounter','11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','draft');
