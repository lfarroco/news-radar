const API_BASE = "";

const state = {
	topics: [],
	articles: [],
	knowledgeBase: [],
	activeTopicDetails: null,
	activeTopicArticles: [],
	activeArticle: null,
	topicSearch: "",
	articleSearch: "",
	newTopicSlugEdited: false,
	activePath: "/",
};

function slugify(value) {
	return (value || "")
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function escapeHtml(text) {
	if (!text) return "";
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
}

function formatDateTime(dateStr) {
	try {
		const date = new Date(dateStr);
		return date.toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return "-";
	}
}

function formatDate(dateStr) {
	try {
		const date = new Date(dateStr);
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	} catch {
		return "-";
	}
}

function normalizePath(pathname) {
	if (!pathname || pathname === "/") return "/";
	return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function parseRoute(pathname) {
	const path = normalizePath(pathname);
	if (path === "/" || path === "/backoffice") return { name: "dashboard" };
	if (path === "/topics") return { name: "topics-list" };
	if (path === "/articles") return { name: "articles-list" };

	const topicMatch = path.match(/^\/topics\/(\d+)$/);
	if (topicMatch) {
		return { name: "topic-detail", id: Number(topicMatch[1]) };
	}

	const articleMatch = path.match(/^\/articles\/(\d+)$/);
	if (articleMatch) {
		return { name: "article-detail", id: Number(articleMatch[1]) };
	}

	return { name: "not-found" };
}

function setNavActive(pathname) {
	const path = normalizePath(pathname);
	const navHome = document.getElementById("nav-home");
	const navTopics = document.getElementById("nav-topics");
	const navArticles = document.getElementById("nav-articles");

	navHome?.classList.remove("active");
	navTopics?.classList.remove("active");
	navArticles?.classList.remove("active");

	if (path === "/" || path === "/backoffice") {
		navHome?.classList.add("active");
		return;
	}

	if (path === "/topics" || path.startsWith("/topics/")) {
		navTopics?.classList.add("active");
		return;
	}

	if (path === "/articles" || path.startsWith("/articles/")) {
		navArticles?.classList.add("active");
	}
}

function setPageMeta(title, subtitle) {
	const titleEl = document.getElementById("page-title");
	const subtitleEl = document.getElementById("page-subtitle");
	if (titleEl) titleEl.textContent = title;
	if (subtitleEl) subtitleEl.textContent = subtitle;
}

function showStatus(message, type = "info") {
	const statusEl = document.getElementById("status-message");
	if (!statusEl) return;

	statusEl.textContent = message;
	statusEl.className = `status-message ${type}`;

	if (type !== "loading") {
		setTimeout(() => {
			if (statusEl.textContent === message) {
				statusEl.textContent = "";
				statusEl.className = "status-message";
			}
		}, 3000);
	}
}

async function requestJson(path, options) {
	const response = await fetch(`${API_BASE}${path}`, options);
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(payload?.error || `HTTP ${response.status}`);
	}
	return payload;
}

async function loadTopics() {
	state.topics = await requestJson("/api/topics");
}

async function loadArticles() {
	state.articles = await requestJson("/api/articles");
}

async function loadTopicDetails(topicId) {
	state.activeTopicDetails = await requestJson(`/api/topics/${topicId}`);
}

async function loadTopicKnowledgeBase(topicId) {
	state.knowledgeBase = await requestJson(`/api/topics/${topicId}/knowledge-base`);
}

async function loadTopicArticles(topicId) {
	state.activeTopicArticles = await requestJson(`/api/topics/${topicId}/articles`);
}

async function loadArticle(articleId) {
	state.activeArticle = await requestJson(`/api/articles/${articleId}`);
}

function createTopic(name, slug) {
	return requestJson("/api/topics", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name, slug }),
	});
}

function updateTopic(topicId, name, slug) {
	return requestJson(`/api/topics/${topicId}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name, slug }),
	});
}

function updateArticle(articleId, data) {
	return requestJson(`/api/articles/${articleId}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	});
}

function ignoreKnowledgeBaseNote(noteId) {
	return requestJson(`/api/topic-notes/${noteId}/ignore`, {
		method: "POST",
	});
}

async function runPipeline() {
	showStatus("Starting pipeline...", "loading");
	await requestJson("/api/tasks/run", { method: "POST" });
	showStatus("Pipeline started successfully", "success");
}

async function compileWebsite() {
	showStatus("Compiling website...", "loading");
	await requestJson("/api/tasks/compile", { method: "POST" });
	showStatus("Website compiled successfully", "success");
}

async function runScout() {
	showStatus("Starting source scout...", "loading");
	await requestJson("/api/tasks/scout", { method: "POST" });
	showStatus("Source scout started successfully", "success");
}

function renderRouteLoading() {
	const view = document.getElementById("route-view");
	if (!view) return;
	view.innerHTML = '<div class="panel"><p class="loading">Loading view...</p></div>';
}

function renderDashboard() {
	const view = document.getElementById("route-view");
	if (!view) return;

	const recentTopics = state.topics.slice(0, 5);
	const recentArticles = state.articles.slice(0, 8);

	view.innerHTML = `
		<section class="dashboard-grid">
			<article class="panel metric-panel">
				<h3>Topics</h3>
				<p class="metric-value">${state.topics.length}</p>
				<a class="ghost-link" href="/topics" data-link="internal">Manage topics</a>
			</article>
			<article class="panel metric-panel">
				<h3>Articles</h3>
				<p class="metric-value">${state.articles.length}</p>
				<a class="ghost-link" href="/articles" data-link="internal">Manage articles</a>
			</article>
			<article class="panel list-panel">
				<div class="panel-head">
					<h3>Recent Topics</h3>
					<a class="ghost-link" href="/topics" data-link="internal">View all</a>
				</div>
				${recentTopics.length === 0 ? '<p class="loading">No topics yet.</p>' : `
					<ul class="simple-list">
						${recentTopics.map((topic) => `
							<li>
								<a href="/topics/${topic.topic_id}" data-link="internal">${escapeHtml(topic.name)}</a>
								<span>${escapeHtml(String(topic.article_count ?? 0))} articles</span>
							</li>
						`).join("")}
					</ul>
				`}
			</article>
			<article class="panel list-panel">
				<div class="panel-head">
					<h3>Recent Articles</h3>
					<a class="ghost-link" href="/articles" data-link="internal">View all</a>
				</div>
				${recentArticles.length === 0 ? '<p class="loading">No articles yet.</p>' : `
					<ul class="simple-list">
						${recentArticles.map((article) => `
							<li>
								<a href="/articles/${Number(article.id)}" data-link="internal">${escapeHtml(article.article_title || article.title || "Untitled article")}</a>
								<span>${formatDate(article.date)}</span>
							</li>
						`).join("")}
					</ul>
				`}
			</article>
		</section>
	`;
}

function renderTopicsList() {
	const view = document.getElementById("route-view");
	if (!view) return;

	const query = state.topicSearch.toLowerCase();
	const filtered = query
		? state.topics.filter((topic) => topic.name?.toLowerCase().includes(query) || topic.slug?.toLowerCase().includes(query))
		: state.topics;

	view.innerHTML = `
		<section class="topics-layout">
			<article class="panel">
				<h3>Create Topic</h3>
				<form id="topic-create-form" class="stack-form">
					<label for="new-topic-name">Name</label>
					<input type="text" id="new-topic-name" name="name" placeholder="e.g. Web Performance" required />
					<label for="new-topic-slug">Slug</label>
					<input type="text" id="new-topic-slug" name="slug" placeholder="e.g. web-performance" />
					<p class="hint" id="new-topic-slug-preview">Slug preview: -</p>
					<button class="btn btn-primary" type="submit">Create Topic</button>
				</form>
			</article>
			<article class="panel">
				<div class="panel-head">
					<h3>Topics</h3>
					<span>${filtered.length} / ${state.topics.length}</span>
				</div>
				<input
					type="search"
					id="topics-search"
					placeholder="Search topics..."
					value="${escapeHtml(state.topicSearch)}"
				/>
				<div class="collection-list">
					${filtered.length === 0 ? '<p class="loading">No matching topics.</p>' : filtered.map((topic) => `
						<div class="collection-item">
							<div>
								<h4>${escapeHtml(topic.name)}</h4>
								<p>/${escapeHtml(topic.slug || "-")} · ${escapeHtml(String(topic.article_count ?? 0))} articles</p>
							</div>
							<a class="btn btn-subtle" href="/topics/${topic.topic_id}" data-link="internal">Open</a>
						</div>
					`).join("")}
				</div>
			</article>
		</section>
	`;

	const nameInput = document.getElementById("new-topic-name");
	const slugInput = document.getElementById("new-topic-slug");
	const slugPreview = document.getElementById("new-topic-slug-preview");
	if (slugPreview) slugPreview.textContent = "Slug preview: -";

	nameInput?.addEventListener("input", () => {
		if (!slugInput) return;
		const generated = slugify(nameInput.value);
		if (!state.newTopicSlugEdited || !slugInput.value.trim()) {
			slugInput.value = generated;
		}
		if (slugPreview) slugPreview.textContent = `Slug preview: ${slugInput.value || generated || "-"}`;
	});

	slugInput?.addEventListener("input", () => {
		const cleaned = slugify(slugInput.value);
		slugInput.value = cleaned;
		state.newTopicSlugEdited = cleaned.length > 0;
		if (slugPreview) slugPreview.textContent = `Slug preview: ${cleaned || "-"}`;
	});
}

function renderLinkList(items, formatter) {
	if (!items || items.length === 0) {
		return '<p class="hint">None configured.</p>';
	}
	return `<ul class="detail-list">${items.map((item) => `<li>${formatter(item)}</li>`).join("")}</ul>`;
}

function renderTopicDetail(routeId) {
	const view = document.getElementById("route-view");
	if (!view) return;

	const details = state.activeTopicDetails;
	if (!details || Number(details.topic_id) !== Number(routeId)) {
		view.innerHTML = '<div class="panel"><p class="loading">Topic not found.</p></div>';
		return;
	}

	view.innerHTML = `
		<section class="detail-layout">
			<article class="panel">
				<div class="panel-head">
					<h3>Edit Topic</h3>
					<a href="/topics" data-link="internal" class="ghost-link">Back to list</a>
				</div>
				<form id="topic-edit-form" class="stack-form" data-topic-id="${Number(details.topic_id)}">
					<label for="topic-edit-name">Name</label>
					<input id="topic-edit-name" name="name" type="text" required value="${escapeHtml(details.name || "")}" />
					<label for="topic-edit-slug">Slug</label>
					<input id="topic-edit-slug" name="slug" type="text" required value="${escapeHtml(details.slug || "")}" />
					<p class="hint">Articles linked: ${escapeHtml(String(details.article_count ?? 0))}</p>
					<button type="submit" class="btn btn-primary">Save Topic</button>
				</form>
			</article>

			<article class="panel">
				<h3>Topic Profile</h3>
				${details.description ? `<p>${escapeHtml(details.description)}</p>` : '<p class="hint">No description provided.</p>'}
				<div class="profile-group">
					<h4>Official Sources</h4>
					${renderLinkList(details.officialSources, (source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label || source.url)}</a>`)}
				</div>
				<div class="profile-group">
					<h4>Community Sources</h4>
					${renderLinkList(details.communityForums, (source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label || source.url)}</a>`)}
				</div>
				<div class="profile-group">
					<h4>RSS Feeds</h4>
					${renderLinkList(details.rssFeedUrls, (url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`)}
				</div>
				<div class="profile-group">
					<h4>Reddit</h4>
					${renderLinkList(details.redditSubreddits, (subreddit) => `r/${escapeHtml(subreddit)}`)}
				</div>
				<div class="profile-group">
					<h4>Scout Search Terms</h4>
					${renderLinkList(details.tavilySearchTerms, (term) => escapeHtml(term))}
				</div>
				<div class="profile-group">
					<h4>Editorial Notes</h4>
					${details.editorialNotes ? `<p>${escapeHtml(details.editorialNotes)}</p>` : '<p class="hint">No editorial notes.</p>'}
				</div>
			</article>

			<article class="panel">
				<h3>Knowledge Base Notes</h3>
				<div class="kb-list">
					${state.knowledgeBase.length === 0 ? '<p class="hint">No knowledge base notes for this topic.</p>' : state.knowledgeBase.map((note) => `
						<div class="kb-item">
							<div class="kb-meta">
								<span>${escapeHtml(note.note_type || "note")}</span>
								<span>${formatDateTime(note.updated_at)}</span>
							</div>
							<p>${escapeHtml(note.content || "")}</p>
							${note.source_url ? `
								<div class="kb-actions">
									<a href="${escapeHtml(note.source_url)}" target="_blank" rel="noopener noreferrer">Source</a>
									<button class="btn btn-danger" data-ignore-note="${Number(note.id)}">Ignore URL</button>
								</div>
							` : ""}
						</div>
					`).join("")}
				</div>
			</article>

			<article class="panel">
				<h3>Topic Articles</h3>
				<div class="collection-list compact">
					${state.activeTopicArticles.length === 0 ? '<p class="hint">No linked articles yet.</p>' : state.activeTopicArticles.slice(0, 30).map((article) => `
						<div class="collection-item">
							<div>
								<h4>${escapeHtml(article.article_title || article.title || "Untitled article")}</h4>
								<p>${formatDate(article.date)}</p>
							</div>
							<a class="btn btn-subtle" href="/articles/${Number(article.id)}" data-link="internal">Open</a>
						</div>
					`).join("")}
				</div>
			</article>
		</section>
	`;
}

function renderArticlesList() {
	const view = document.getElementById("route-view");
	if (!view) return;

	const query = state.articleSearch.toLowerCase();
	const filtered = query
		? state.articles.filter((article) =>
			(article.article_title || article.title || "").toLowerCase().includes(query) ||
			(article.topic_name || article.topics || "").toLowerCase().includes(query),
		)
		: state.articles;

	view.innerHTML = `
		<section class="panel">
			<div class="panel-head">
				<h3>Articles</h3>
				<span>${filtered.length} / ${state.articles.length}</span>
			</div>
			<input
				type="search"
				id="articles-search"
				placeholder="Search by title or topic..."
				value="${escapeHtml(state.articleSearch)}"
			/>
			<div class="collection-list">
				${filtered.length === 0 ? '<p class="loading">No matching articles.</p>' : filtered.map((article) => `
					<div class="collection-item">
						<div>
							<h4>${escapeHtml(article.article_title || article.title || "Untitled article")}</h4>
							<p>${escapeHtml(article.topic_name || article.topics || "No topic")} · ${formatDate(article.date)}</p>
						</div>
						<a class="btn btn-subtle" href="/articles/${Number(article.id)}" data-link="internal">Open</a>
					</div>
				`).join("")}
			</div>
		</section>
	`;
}

function renderArticleDetail(routeId) {
	const view = document.getElementById("route-view");
	if (!view) return;

	const article = state.activeArticle;
	if (!article || Number(article.id) !== Number(routeId)) {
		view.innerHTML = '<div class="panel"><p class="loading">Article not found.</p></div>';
		return;
	}

	view.innerHTML = `
		<section class="panel article-editor-panel">
			<div class="panel-head">
				<h3>Edit Article</h3>
				<a href="/articles" data-link="internal" class="ghost-link">Back to list</a>
			</div>
			<form id="article-edit-form" class="stack-form" data-article-id="${Number(article.id)}">
				<label for="article-title">Title</label>
				<input id="article-title" name="title" type="text" required value="${escapeHtml(article.article_title || article.title || "")}" />
				<label for="article-content">Content</label>
				<textarea id="article-content" name="body" rows="16">${escapeHtml(article.article_content || article.body || "")}</textarea>
				<label for="article-slug">Slug</label>
				<input id="article-slug" name="slug" type="text" value="${escapeHtml(article.slug || "")}" />
				<label for="article-topic">Topic</label>
				<input id="article-topic" name="topic" type="text" readonly value="${escapeHtml(article.topic_name || article.topics || "")}" />
				<label for="article-url">Source URL</label>
				<input id="article-url" name="url" type="url" readonly value="${escapeHtml(article.url || article.link || "")}" />
				<button type="submit" class="btn btn-primary">Save Article</button>
			</form>
		</section>
	`;
}

function renderNotFound() {
	const view = document.getElementById("route-view");
	if (!view) return;

	view.innerHTML = `
		<section class="panel">
			<h3>Route not found</h3>
			<p class="hint">Try one of the core routes below.</p>
			<div class="button-row">
				<a href="/" class="btn btn-subtle" data-link="internal">Dashboard</a>
				<a href="/topics" class="btn btn-subtle" data-link="internal">Topics</a>
				<a href="/articles" class="btn btn-subtle" data-link="internal">Articles</a>
			</div>
		</section>
	`;
}

async function renderCurrentRoute() {
	const route = parseRoute(location.pathname);
	state.activePath = normalizePath(location.pathname);
	setNavActive(state.activePath);
	renderRouteLoading();

	try {
		if (route.name === "dashboard") {
			setPageMeta("Dashboard", "Overview of topics, articles, and operational shortcuts.");
			await Promise.all([loadTopics(), loadArticles()]);
			renderDashboard();
			return;
		}

		if (route.name === "topics-list") {
			setPageMeta("Topics", "Browse, search, and create topics.");
			await loadTopics();
			renderTopicsList();
			return;
		}

		if (route.name === "topic-detail") {
			setPageMeta("Topic Detail", "Edit topic metadata and inspect linked context.");
			await Promise.all([
				loadTopicDetails(route.id),
				loadTopicKnowledgeBase(route.id),
				loadTopicArticles(route.id),
			]);
			renderTopicDetail(route.id);
			return;
		}

		if (route.name === "articles-list") {
			setPageMeta("Articles", "Search and open articles for editing.");
			await loadArticles();
			renderArticlesList();
			return;
		}

		if (route.name === "article-detail") {
			setPageMeta("Article Detail", "Edit article content and publishing metadata.");
			await loadArticle(route.id);
			renderArticleDetail(route.id);
			return;
		}

		setPageMeta("Not Found", "The requested route is not available.");
		renderNotFound();
	} catch (error) {
		showStatus(`Failed to load route: ${error.message}`, "error");
		const view = document.getElementById("route-view");
		if (view) {
			view.innerHTML = `<div class="panel"><p class="loading">${escapeHtml(error.message)}</p></div>`;
		}
	}
}

function navigate(path) {
	const target = normalizePath(path || "/");
	if (target === state.activePath) return;
	history.pushState({}, "", target);
	renderCurrentRoute();
}

function initializeNavigation() {
	document.addEventListener("click", (event) => {
		const link = event.target.closest('a[data-link="internal"]');
		if (!link) return;

		event.preventDefault();
		navigate(link.getAttribute("href") || "/");
	});

	globalThis.addEventListener("popstate", () => {
		renderCurrentRoute();
	});
}

function initializeGlobalActions() {
	const pipelineBtn = document.getElementById("run-pipeline-btn");
	const compileBtn = document.getElementById("compile-website-btn");
	const scoutBtn = document.getElementById("run-scout-btn");

	pipelineBtn?.addEventListener("click", async () => {
		try {
			await runPipeline();
		} catch (error) {
			showStatus(`Failed to start pipeline: ${error.message}`, "error");
		}
	});

	compileBtn?.addEventListener("click", async () => {
		try {
			await compileWebsite();
		} catch (error) {
			showStatus(`Failed to compile website: ${error.message}`, "error");
		}
	});

	scoutBtn?.addEventListener("click", async () => {
		try {
			await runScout();
		} catch (error) {
			showStatus(`Failed to run scout: ${error.message}`, "error");
		}
	});
}

function initializeFormsAndInputs() {
	document.addEventListener("input", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;

		if (target.id === "topics-search") {
			state.topicSearch = target.value || "";
			renderTopicsList();
			return;
		}

		if (target.id === "articles-search") {
			state.articleSearch = target.value || "";
			renderArticlesList();
		}
	});

	document.addEventListener("submit", async (event) => {
		const form = event.target;
		if (!(form instanceof HTMLFormElement)) return;

		if (form.id === "topic-create-form") {
			event.preventDefault();
			const name = String(new FormData(form).get("name") || "").trim();
			const slugInput = String(new FormData(form).get("slug") || "").trim();
			const slug = slugify(slugInput || name);

			if (!name) {
				showStatus("Topic name is required", "error");
				return;
			}

			try {
				showStatus("Creating topic...", "loading");
				const created = await createTopic(name, slug);
				showStatus(`Topic \"${created.name}\" created`, "success");
				state.newTopicSlugEdited = false;
				await loadTopics();
				renderTopicsList();
			} catch (error) {
				showStatus(`Failed to create topic: ${error.message}`, "error");
			}
			return;
		}

		if (form.id === "topic-edit-form") {
			event.preventDefault();
			const topicId = Number(form.dataset.topicId);
			const name = String(new FormData(form).get("name") || "").trim();
			const slug = slugify(String(new FormData(form).get("slug") || "").trim() || name);

			if (!name || !slug || !Number.isFinite(topicId)) {
				showStatus("Valid topic name and slug are required", "error");
				return;
			}

			try {
				showStatus("Saving topic...", "loading");
				await updateTopic(topicId, name, slug);
				showStatus("Topic saved successfully", "success");
				await Promise.all([
					loadTopicDetails(topicId),
					loadTopicKnowledgeBase(topicId),
					loadTopicArticles(topicId),
				]);
				renderTopicDetail(topicId);
			} catch (error) {
				showStatus(`Failed to save topic: ${error.message}`, "error");
			}
			return;
		}

		if (form.id === "article-edit-form") {
			event.preventDefault();
			const articleId = Number(form.dataset.articleId);
			const title = String(new FormData(form).get("title") || "").trim();
			const body = String(new FormData(form).get("body") || "").trim();
			const slug = String(new FormData(form).get("slug") || "").trim();

			if (!title || !Number.isFinite(articleId)) {
				showStatus("Article title is required", "error");
				return;
			}

			try {
				showStatus("Saving article...", "loading");
				await updateArticle(articleId, { title, body, slug });
				showStatus("Article saved successfully", "success");
				await loadArticle(articleId);
				renderArticleDetail(articleId);
			} catch (error) {
				showStatus(`Failed to save article: ${error.message}`, "error");
			}
		}
	});

	document.addEventListener("click", async (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;

		const ignoreBtn = target.closest("[data-ignore-note]");
		if (!ignoreBtn) return;

		event.preventDefault();
		const noteId = Number(ignoreBtn.getAttribute("data-ignore-note"));
		const route = parseRoute(location.pathname);
		if (route.name !== "topic-detail" || !Number.isFinite(noteId)) return;

		try {
			showStatus("Ignoring source for future scout runs...", "loading");
			await ignoreKnowledgeBaseNote(noteId);
			showStatus("Source will be skipped on future scout runs", "success");
			await loadTopicKnowledgeBase(route.id);
			renderTopicDetail(route.id);
		} catch (error) {
			showStatus(`Failed to ignore source: ${error.message}`, "error");
		}
	});
}

function initializeAutoRefresh() {
	setInterval(async () => {
		const route = parseRoute(location.pathname);
		try {
			if (route.name === "dashboard") {
				await Promise.all([loadTopics(), loadArticles()]);
				renderDashboard();
				return;
			}

			if (route.name === "topics-list") {
				await loadTopics();
				renderTopicsList();
				return;
			}

			if (route.name === "articles-list") {
				await loadArticles();
				renderArticlesList();
				return;
			}

			if (route.name === "topic-detail") {
				await Promise.all([
					loadTopicDetails(route.id),
					loadTopicKnowledgeBase(route.id),
					loadTopicArticles(route.id),
				]);
				renderTopicDetail(route.id);
				return;
			}

			if (route.name === "article-detail") {
				await loadArticle(route.id);
				renderArticleDetail(route.id);
			}
		} catch {
			// Passive refresh should not interrupt active editing workflow with error noise.
		}
	}, 30000);
}

document.addEventListener("DOMContentLoaded", async () => {
	initializeNavigation();
	initializeGlobalActions();
	initializeFormsAndInputs();
	initializeAutoRefresh();
	await renderCurrentRoute();
});