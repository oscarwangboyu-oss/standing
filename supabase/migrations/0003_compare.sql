-- Friend compare: an invite link, and once it is accepted a comparison between two people.
--
-- Both tables hold data of a person, so both have a user_id column and are listed in
-- USER_TABLES (src/server/tables.ts). Deleting an account removes its invites and its
-- comparisons, on both sides.

-- One row per invite link. The code in the link is random and is stored only as a SHA-256
-- hash, like a device token. An invite is used once and expires.
create table compare_invites (
  code_hash text primary key,
  -- The person who made the link.
  user_id text not null references users (id) on delete cascade,
  created_at text not null,
  expires_at text not null,
  -- Set when someone accepted the invite. An accepted invite cannot be used again.
  accepted_at text,
  -- The comparison the invite led to.
  pair_id text
);
create index compare_invites_user on compare_invites (user_id);
create index compare_invites_pair on compare_invites (pair_id) where pair_id is not null;

-- A comparison is two rows with the same pair_id, one per person, so that export and delete
-- find it from either side by user_id. No prices are stored here: the comparison is read from
-- the latest result of each person at the moment it is asked for.
create table comparisons (
  pair_id text not null,
  user_id text not null references users (id) on delete cascade,
  -- The other person. When either account is deleted, both rows go.
  other_user_id text not null references users (id) on delete cascade,
  created_at text not null,
  primary key (pair_id, user_id),
  check (user_id <> other_user_id)
);
-- Two people have at most one comparison.
create unique index comparisons_people on comparisons (user_id, other_user_id);
create index comparisons_other on comparisons (other_user_id);
