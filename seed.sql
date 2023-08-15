--
-- PostgreSQL database dump
--

-- Dumped from database version 14.1
-- Dumped by pg_dump version 14.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: article_topic; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.article_topic (
    article_id integer NOT NULL,
    topic_id integer NOT NULL
);


ALTER TABLE public.article_topic OWNER TO root;

--
-- Name: info; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.info (
    id integer NOT NULL,
    title text,
    link text,
    status text,
    source text,
    original text,
    date date,
    article text,
    created_at timestamp with time zone DEFAULT now(),
    article_title text,
    article_content text,
    slug text,
    url text
);


ALTER TABLE public.info OWNER TO root;

--
-- Name: info_id_seq; Type: SEQUENCE; Schema: public; Owner: root
--

CREATE SEQUENCE public.info_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.info_id_seq OWNER TO root;

--
-- Name: info_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.info_id_seq OWNED BY public.info.id;


--
-- Name: topics; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.topics (
    id integer NOT NULL,
    name character varying(128),
    slug text
);


ALTER TABLE public.topics OWNER TO root;

--
-- Name: topics_id_seq; Type: SEQUENCE; Schema: public; Owner: root
--

CREATE SEQUENCE public.topics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.topics_id_seq OWNER TO root;

--
-- Name: topics_id_seq1; Type: SEQUENCE; Schema: public; Owner: root
--

CREATE SEQUENCE public.topics_id_seq1
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.topics_id_seq1 OWNER TO root;

--
-- Name: topics_id_seq1; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.topics_id_seq1 OWNED BY public.topics.id;


--
-- Name: info id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.info ALTER COLUMN id SET DEFAULT nextval('public.info_id_seq'::regclass);


--
-- Name: topics id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.topics ALTER COLUMN id SET DEFAULT nextval('public.topics_id_seq1'::regclass);


--
-- Name: article_topic article_topic_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.article_topic
    ADD CONSTRAINT article_topic_pkey PRIMARY KEY (article_id, topic_id);


--
-- Name: info info_link_key; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.info
    ADD CONSTRAINT info_link_key UNIQUE (link);


--
-- Name: info info_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.info
    ADD CONSTRAINT info_pkey PRIMARY KEY (id);


--
-- Name: topics topics_id_key; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_id_key UNIQUE (id);


--
-- Name: topics unique_slug; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT unique_slug UNIQUE (slug);


--
-- Name: article_topic fk_article; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.article_topic
    ADD CONSTRAINT fk_article FOREIGN KEY (article_id) REFERENCES public.info(id) ON DELETE CASCADE;


--
-- Name: article_topic fk_topic; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.article_topic
    ADD CONSTRAINT fk_topic FOREIGN KEY (topic_id) REFERENCES public.topics(id);


--
-- PostgreSQL database dump complete
--

