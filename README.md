## ChattingGO - Real-time Chatting Application

ChattingGO, The messaging app that have real-time message feature with image sharing. username & name base user searching with encryption

# Install dependencies
`npm install`

# start project 

`npm expo start`

start project and open in expo-go application using url or scanning QR code

## Supabase Tables schemas

# 1.profiles

```bash
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
```

# 2.messages 

```bash
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
```

# 3.chats 

```bash
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
```

## Supabase Buckets: 

1. avatars (for user profile image store)<br>
(RLS)<br>
-Select (public)<br>
-Update (authenticated)<br>
-Insert (authenticated)<br>

2. files (for user image shearing through chats)<br>
(RLS)<br>
-Select (public)<br>
-Update (authenticated)<br>
-Insert (authenticated)<br>



