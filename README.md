---Project Packages Need To Install (ChattingGO)---

# Install dependencies
npm install

# Navigation 
npm install @react-navigation/native 

# Async Storage   
npm install @react-native-async-storage/async-storage 

# Image Picking 
npm install expo-image-picker 

# Safe Area Handling 
npm install react-native-safe-area-context 

# Icons 
npm install react-native-vector-icons 

# Supabase 
npm install @supabase/supabase-js 

# Buffer polyfill 
npm install buffer 



---Supabase TableS And Buckets Details---

Supabase Tables: 

# 1.profiles

create table public.profiles ( 
id uuid not null, 
username text null, 
name text null, 
avatar_url text null, 
online_status boolean null default false, 
last_seen timestamp with time zone null default now(), 
created_at timestamp with time zone null default now(), 
updated_at text null, 
constraint profiles_pkey primary key (id), 
constraint profiles_username_key unique (username), 
constraint profiles_id_fkey foreign KEY (id) references auth.users (id) 
) TABLESPACE pg_default; 

# 2.messages 

create table public.messages ( 
id uuid not null default gen_random_uuid (), 
chat_id uuid null, 
sender_id uuid null, 
content text not null, 
created_at timestamp with time zone null default now(), 
image_url text null, 
constraint messages_pkey primary key (id), 
constraint messages_chat_id_fkey foreign KEY (chat_id) references chats (id) on 
delete CASCADE, 
constraint messages_sender_id_fkey foreign KEY (sender_id) references profiles (id) 
) TABLESPACE pg_default; 
create index IF not exists idx_messages_chat_id on public.messages using btree 
(chat_id) TABLESPACE pg_default; 
create index IF not exists idx_messages_created_at on public.messages using btree 
(created_at) TABLESPACE pg_default; 

# 3.chats 

create table public.chats ( 
id uuid not null default gen_random_uuid (), 
participant1_fkey uuid null, 
participant2_fkey uuid null, 
created_at timestamp with time zone null default now(), 
updated_at timestamp with time zone null default now(), 
constraint chats_pkey primary key (id), 
constraint chats_participant1_fkey_participant2_fkey_key unique (participant1_fkey, 
participant2_fkey), 
constraint chats_participant1_fkey foreign KEY (participant1_fkey) references profiles 
(id), 
constraint chats_participant1_fkey_fkey foreign KEY (participant1_fkey) references 
profiles (id), 
constraint chats_participant2_fkey foreign KEY (participant2_fkey) references profiles 
(id), 
constraint chats_participant2_fkey_fkey foreign KEY (participant2_fkey) references 
profiles (id) 
) TABLESPACE pg_default; 
create index IF not exists idx_chats_updated_at on public.chats using btree 
(updated_at) TABLESPACE pg_default;

Supabase Buckets: 

1. avatars (for user profile image store)
(RLS)
-Select (public)
-Update (authenticated)
-Insert (authenticated)

2. files (for user image shearing through chats)
(RLS)
-Select (public)
-Update (authenticated)
-Insert (authenticated)



