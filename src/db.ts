import pg from 'pg';

export const dbClient = new pg.Client({
  password: 'root',
  user: 'root',
  host: 'postgres',
});


