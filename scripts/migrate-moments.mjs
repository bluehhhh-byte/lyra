import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

dotenv.config({ path: ".env.local", override: false, quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL이 없습니다");
const sql = neon(process.env.DATABASE_URL);

await sql`
  create table if not exists lyra_moments (
    slug text primary key,
    title text not null,
    body text not null,
    start_date date not null,
    end_date date,
    emotions text[] not null default '{}',
    keywords text[] not null default '{}',
    published boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (end_date is null or end_date >= start_date)
  )
`;
await sql`
  create table if not exists lyra_moment_links (
    moment_slug text not null references lyra_moments(slug) on update cascade on delete cascade,
    target_kind text not null check (target_kind in ('song', 'movie')),
    target_slug text not null,
    excerpt text not null default '',
    note text not null default '',
    position integer not null default 0,
    primary key (moment_slug, target_kind, target_slug),
    foreign key (target_kind, target_slug) references lyra_contents(kind, slug) on update cascade on delete cascade
  )
`;
await sql`create index if not exists lyra_moment_links_target on lyra_moment_links(target_kind, target_slug)`;

console.log("장면과 작품 연결 테이블 준비 완료");
