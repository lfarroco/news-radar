// State
let allArticles = [];
let allTopics = [];
let allKnowledgeBaseNotes = [];
let selectedTopic = null;
let selectedTopicDetails = null;
let selectedArticle = null;
let selectedTopicForEdit = null;
const API_BASE = "";
let topicSlugManuallyEdited = false;

function slugify(value) {
	return (value || "")
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function updateTopicSlugPreview(slug) {
	const preview = document.getElementById("new-topic-slug-preview");
	if (!preview) return;
	preview.textContent = `Slug preview: ${slug || "-"}`;
}

function updateHeaderCounts() {
	const topicsCountEl = document.getElementById("topics-count-header");
	const articlesCountEl = document.getElementById("articles-count-header");
	if (topicsCountEl) topicsCountEl.textContent = String(allTopics.length);
	if (articlesCountEl) articlesCountEl.textContent = String(allArticles.length);
}

function focusSection(sectionId) {
	const section = document.getElementById(sectionId);
	if (!section) return;
	section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatDateTime(dateStr) {
	try {
		const date = new Date(dateStr);
		return date.toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return "";
	}
}

function handleTopicNameInput() {
	const nameInput = document.getElementById("new-topic-name");
	const slugInput = document.getElementById("new-topic-slug");
	if (!nameInput || !slugInput) return;

	const generated = slugify(nameInput.value);
	if (!topicSlugManuallyEdited || !slugInput.value.trim()) {
		slugInput.value = generated;
	}

	updateTopicSlugPreview(slugInput.value.trim() || generated);
}

function handleTopicSlugInput() {
	const slugInput = document.getElementById("new-topic-slug");
	if (!slugInput) return;

	const cleaned = slugify(slugInput.value);
	const wasManuallyEdited = slugInput.value.trim().length > 0;
	slugInput.value = cleaned;
	topicSlugManuallyEdited = wasManuallyEdited;
	updateTopicSlugPreview(cleaned);
}

// Utility functions
function showStatus(message, type = "info") {
	const statusEl = document.getElementById("status-message");
	statusEl.textContent = message;
	statusEl.className = `status-message ${type}`;

	if (type !== "loading") {
		setTimeout(() => {
			statusEl.textContent = "";
			statusEl.className = "status-message";
		}, 3000);
	}
}

// Load all data
async function loadData() {
	try {
		await Promise.all([loadTopics(), loadArticles()]);
	} catch (error) {
		showStatus(`Failed to load data: ${error.message}`, "error");
	}
}

async function loadTopics() {
	try {
		const response = await fetch(`${API_BASE}/api/topics`);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		allTopics = await response.json();
		updateHeaderCounts();
		renderTopics();
	} catch (error) {
		showStatus(`Failed to load topics: ${error.message}`, "error");
	}
}

async function createTopic() {
	const nameInput = document.getElementById("new-topic-name");
	const slugInput = document.getElementById("new-topic-slug");

	const name = nameInput?.value?.trim() || "";
	const slug = slugify(slugInput?.value?.trim() || "");

	if (!name) {
		showStatus("Topic name is required", "error");
		return;
	}

	try {
		showStatus("Creating topic...", "loading");
		const response = await fetch(`${API_BASE}/api/topics`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ name, slug }),
		});

		const payload = await response.json();

		if (!response.ok) {
			throw new Error(payload.error || `HTTP ${response.status}`);
		}

		nameInput.value = "";
		slugInput.value = "";
		topicSlugManuallyEdited = false;
		updateTopicSlugPreview("");
		showStatus(`Topic "${payload.name}" created`, "success");
		await loadTopics();
	} catch (error) {
		showStatus(`Failed to create topic: ${error.message}`, "error");
	}
}

function renderTopics() {
	const container = document.getElementById("topics-list");

	if (allTopics.length === 0) {
		container.innerHTML = '<p class="loading">No topics found</p>';
		return;
	}

	container.innerHTML = allTopics
		.map(
			(topic) => `
		<div class="topic-item ${selectedTopic?.topic_id === topic.topic_id ? "active" : ""}" 
		     onclick="selectTopic(${JSON.stringify(topic).replace(/"/g, "&quot;")})">
			<div class="topic-name">${escapeHtml(topic.name)}</div>
			<div class="topic-actions">
				<div class="topic-count">${topic.article_count} articles</div>
				<button class="topic-edit-btn" onclick="editTopic(event, ${JSON.stringify(topic).replace(/"/g, "&quot;")})">Edit</button>
			</div>
		</div>
	`
		)
		.join("");
}

function editTopic(event, topic) {
	event.stopPropagation();
	selectedTopicForEdit = topic;

	document.getElementById("topic-editor-name").value = topic.name || "";
	document.getElementById("topic-editor-slug").value = topic.slug || "";
	document.getElementById("topic-editor-count").value = `${topic.article_count ?? 0} articles`;
	document.getElementById("topic-editor-modal").style.display = "flex";
}

function closeTopicEditor() {
	document.getElementById("topic-editor-modal").style.display = "none";
	selectedTopicForEdit = null;
}

async function saveTopic() {
	if (!selectedTopicForEdit) return;

	const name = document.getElementById("topic-editor-name").value.trim();
	const slug = slugify(document.getElementById("topic-editor-slug").value.trim() || name);

	if (!name) {
		showStatus("Topic name is required", "error");
		return;
	}

	try {
		showStatus("Saving topic...", "loading");
		const response = await fetch(`${API_BASE}/api/topics/${selectedTopicForEdit.topic_id}`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ name, slug }),
		});

		const payload = await response.json();
		if (!response.ok) {
			throw new Error(payload.error || `HTTP ${response.status}`);
		}

		showStatus(`Topic "${payload.name}" saved`, "success");
		closeTopicEditor();
		await loadTopics();

		if (selectedTopic?.topic_id === selectedTopicForEdit?.topic_id) {
			selectedTopic = { ...selectedTopic, name: payload.name, slug: payload.slug };
		}
	} catch (error) {
		showStatus(`Failed to save topic: ${error.message}`, "error");
	}
}

async function selectTopic(topic) {
	// Toggle selection: clicking the active topic resets to full latest feed
	if (selectedTopic?.topic_id === topic.topic_id) {
		selectedTopic = null;
		selectedTopicDetails = null;
		allKnowledgeBaseNotes = [];
		renderTopicDetails();
		renderKnowledgeBase();
		renderTopics();
		await loadArticles();
		return;
	}

	selectedTopic = topic;
	selectedTopicDetails = null;
	renderTopics();
	renderTopicDetails();
	await Promise.all([
		loadArticlesByTopic(topic.topic_id),
		loadKnowledgeBaseByTopic(topic.topic_id),
		loadTopicDetails(topic.topic_id),
	]);
}

async function loadTopicDetails(topicId) {
	try {
		const response = await fetch(`${API_BASE}/api/topics/${topicId}`);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		selectedTopicDetails = await response.json();
		selectedTopic = { ...selectedTopic, ...selectedTopicDetails };
		renderTopicDetails();
	} catch (error) {
		selectedTopicDetails = null;
		renderTopicDetails(error.message);
	}
}

function renderLinkList(items, formatter) {
	if (!items || items.length === 0) {
		return '<p class="topic-detail-empty">None configured.</p>';
	}

	return `
		<ul class="topic-detail-list">
			${items.map((item) => `<li>${formatter(item)}</li>`).join("")}
		</ul>
	`;
}

function renderTopicDetails(errorMessage = "") {
	const container = document.getElementById("topic-details");
	if (!container) return;

	if (!selectedTopic) {
		container.innerHTML = '<p class="loading">Select a topic to view sources and profile details...</p>';
		return;
	}

	if (errorMessage) {
		container.innerHTML = `<p class="loading">Failed to load topic details: ${escapeHtml(errorMessage)}</p>`;
		return;
	}

	if (!selectedTopicDetails) {
		container.innerHTML = '<p class="loading">Loading topic details...</p>';
		return;
	}

	container.innerHTML = `
		<div class="topic-detail-card">
			<div class="topic-detail-meta">
				<span class="topic-detail-slug">${escapeHtml(selectedTopicDetails.slug || "-")}</span>
				<span class="topic-detail-count">${escapeHtml(String(selectedTopicDetails.article_count ?? 0))} articles</span>
			</div>
			${selectedTopicDetails.description ? `<p class="topic-detail-description">${escapeHtml(selectedTopicDetails.description)}</p>` : '<p class="topic-detail-empty">No topic description yet.</p>'}
			<div class="topic-detail-group">
				<h4>Official Sources</h4>
				${renderLinkList(selectedTopicDetails.officialSources, (source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label || source.url)}</a>`)}
			</div>
			<div class="topic-detail-group">
				<h4>Community Sources</h4>
				${renderLinkList(selectedTopicDetails.communityForums, (source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label || source.url)}</a>`)}
			</div>
			<div class="topic-detail-group">
				<h4>RSS Feeds</h4>
				${renderLinkList(selectedTopicDetails.rssFeedUrls, (url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`)}
			</div>
			<div class="topic-detail-group">
				<h4>Reddit</h4>
				${renderLinkList(selectedTopicDetails.redditSubreddits, (subreddit) => `r/${escapeHtml(subreddit)}`)}
			</div>
			<div class="topic-detail-group">
				<h4>Scout Search Terms</h4>
				${renderLinkList(selectedTopicDetails.tavilySearchTerms, (term) => escapeHtml(term))}
			</div>
			<div class="topic-detail-group">
				<h4>Editorial Notes</h4>
				${selectedTopicDetails.editorialNotes ? `<p class="topic-detail-editorial">${escapeHtml(selectedTopicDetails.editorialNotes)}</p>` : '<p class="topic-detail-empty">No editorial notes yet.</p>'}
			</div>
		</div>
	`;
}

async function loadArticles() {
	try {
		const response = await fetch(`${API_BASE}/api/articles`);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		allArticles = await response.json();
		updateHeaderCounts();
		filterArticles();
	} catch (error) {
		showStatus(`Failed to load articles: ${error.message}`, "error");
	}
}

async function loadArticlesByTopic(topicId) {
	try {
		const response = await fetch(`${API_BASE}/api/topics/${topicId}/articles`);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		allArticles = await response.json();
		updateHeaderCounts();
		filterArticles();
	} catch (error) {
		showStatus(`Failed to load topic articles: ${error.message}`, "error");
	}
}

async function loadKnowledgeBaseByTopic(topicId) {
	try {
		const response = await fetch(`${API_BASE}/api/topics/${topicId}/knowledge-base`);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		allKnowledgeBaseNotes = await response.json();
		renderKnowledgeBase();
	} catch (error) {
		showStatus(`Failed to load knowledge base: ${error.message}`, "error");
	}
}

function renderKnowledgeBase() {
	const container = document.getElementById("knowledge-base-list");
	if (!container) return;

	if (!selectedTopic) {
		container.innerHTML = '<p class="loading">Select a topic to view notes...</p>';
		return;
	}

	if (allKnowledgeBaseNotes.length === 0) {
		container.innerHTML = '<p class="loading">No knowledge base notes for this topic.</p>';
		return;
	}

	container.innerHTML = allKnowledgeBaseNotes
		.map(
			(note) => `
		<div class="kb-note">
			<div class="kb-note-header">
				<span class="kb-note-type">${escapeHtml(note.note_type || "note")}</span>
				<span class="kb-note-date">${formatDateTime(note.updated_at)}</span>
			</div>
			<div class="kb-note-content">${escapeHtml(note.content || "")}</div>
			${note.source_url ? `<a class="kb-note-source" href="${escapeHtml(note.source_url)}" target="_blank" rel="noopener noreferrer">Source</a>` : ""}
		</div>
	`
		)
		.join("");
}

function filterArticles() {
	const searchInput = document.getElementById("article-search");
	const searchTerm = searchInput?.value.toLowerCase() || "";

	let filtered = allArticles;

	if (searchTerm) {
		filtered = filtered.filter(
			(article) =>
				article.title?.toLowerCase().includes(searchTerm) ||
				article.article_title?.toLowerCase().includes(searchTerm)
		);
	}

	renderArticles(filtered);
}

function renderArticles(articles) {
	const container = document.getElementById("articles-list");

	if (articles.length === 0) {
		container.innerHTML =
			'<p class="loading">' +
			(selectedTopic ? "No articles for this topic" : "No articles found") +
			"</p>";
		return;
	}

	container.innerHTML = articles
		.map(
			(article) => `
		<div class="article-item" onclick="selectArticle(${JSON.stringify(article).replace(/"/g, "&quot;")})">
			<div class="article-title">${escapeHtml(article.article_title || article.title)}</div>
			<div class="article-actions">
				<span class="article-date">${formatDate(article.date)}</span>
				<button class="btn-icon" onclick="editArticle(event, ${JSON.stringify(article).replace(/"/g, "&quot;")})">✏️</button>
			</div>
		</div>
	`
		)
		.join("");
}

function selectArticle(article) {
	selectedArticle = article;
}

function editArticle(event, article) {
	event.stopPropagation();
	selectedArticle = article;

	document.getElementById("editor-title").value = article.article_title || "";
	document.getElementById("editor-content").value = article.article_content || "";
	document.getElementById("editor-topic").value =
		article.topic_name || article.topics || "";
	document.getElementById("editor-url").value = article.url || article.link || "";
	document.getElementById("editor-slug").value = article.slug || "";

	document.getElementById("editor-modal").style.display = "flex";
}

function closeEditor() {
	document.getElementById("editor-modal").style.display = "none";
	selectedArticle = null;
}

async function saveArticle() {
	if (!selectedArticle) return;

	const articleId = Number(selectedArticle.id);
	if (!Number.isFinite(articleId)) {
		showStatus("Invalid article id", "error");
		return;
	}

	const updatedArticle = {
		title: document.getElementById("editor-title").value.trim(),
		body: document.getElementById("editor-content").value.trim(),
		slug: document.getElementById("editor-slug").value.trim(),
	};

	if (!updatedArticle.title) {
		showStatus("Article title is required", "error");
		return;
	}

	try {
		showStatus("Saving article...", "loading");

		const response = await fetch(`${API_BASE}/api/articles/${articleId}`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(updatedArticle),
		});

		const payload = await response.json();
		if (!response.ok) {
			throw new Error(payload.error || `HTTP ${response.status}`);
		}

		if (selectedTopic?.topic_id) {
			await loadArticlesByTopic(selectedTopic.topic_id);
		} else {
			await loadArticles();
		}

		showStatus("Article saved successfully", "success");
		closeEditor();
		filterArticles();
	} catch (error) {
		showStatus(`Failed to save article: ${error.message}`, "error");
	}
}

// Task handlers
async function runPipeline() {
	try {
		showStatus("Starting pipeline...", "loading");

		const response = await fetch(`${API_BASE}/api/tasks/run`, { method: "POST" });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		await response.json();
		showStatus("Pipeline started successfully", "success");
	} catch (error) {
		showStatus(`Failed to start pipeline: ${error.message}`, "error");
	}
}

async function compileWebsite() {
	try {
		showStatus("Compiling website...", "loading");

		const response = await fetch(`${API_BASE}/api/tasks/compile`, {
			method: "POST",
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		await response.json();
		showStatus("Website compiled successfully", "success");
	} catch (error) {
		showStatus(`Failed to compile website: ${error.message}`, "error");
	}
}

async function runScout() {
	try {
		showStatus("Starting source scout...", "loading");

		const response = await fetch(`${API_BASE}/api/tasks/scout`, {
			method: "POST",
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		await response.json();
		showStatus("Source scout started successfully", "success");
	} catch (error) {
		showStatus(`Failed to start source scout: ${error.message}`, "error");
	}
}

// Utility functions
function escapeHtml(text) {
	if (!text) return "";
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
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
		return "";
	}
}

// Close modal on ESC key
document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") {
		closeEditor();
	}
});

// Initialize
document.addEventListener("DOMContentLoaded", () => {
	const topicNameInput = document.getElementById("new-topic-name");
	const topicSlugInput = document.getElementById("new-topic-slug");
	topicNameInput?.addEventListener("input", handleTopicNameInput);
	topicSlugInput?.addEventListener("input", handleTopicSlugInput);
	updateTopicSlugPreview(topicSlugInput?.value?.trim() || "");

	loadData();
	renderTopicDetails();
	renderKnowledgeBase();

	// Auto-refresh data every 30 seconds
	setInterval(loadData, 30000);
});

Object.assign(window, {
	focusSection,
	createTopic,
	editTopic,
	closeTopicEditor,
	saveTopic,
	selectTopic,
	selectArticle,
	editArticle,
	closeEditor,
	saveArticle,
	runPipeline,
	compileWebsite,
	runScout,
	filterArticles,
});
