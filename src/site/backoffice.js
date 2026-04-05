// State
let allArticles = [];
let allTopics = [];
let selectedTopic = null;
let selectedArticle = null;
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
			<div class="topic-count">${topic.article_count} articles</div>
		</div>
	`
		)
		.join("");
}

async function selectTopic(topic) {
	// Toggle selection: clicking the active topic resets to full latest feed
	if (selectedTopic?.topic_id === topic.topic_id) {
		selectedTopic = null;
		renderTopics();
		await loadArticles();
		return;
	}

	selectedTopic = topic;
	renderTopics();
	await loadArticlesByTopic(topic.topic_id);
}

async function loadArticles() {
	try {
		const response = await fetch(`${API_BASE}/api/articles`);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		allArticles = await response.json();
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
		filterArticles();
	} catch (error) {
		showStatus(`Failed to load topic articles: ${error.message}`, "error");
	}
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

	const updatedArticle = {
		...selectedArticle,
		article_title: document.getElementById("editor-title").value,
		article_content: document.getElementById("editor-content").value,
		slug: document.getElementById("editor-slug").value,
	};

	try {
		showStatus("Saving article...", "loading");

		// In a real implementation, you'd POST this to an update endpoint
		// For now, we'll just update the local state
		const index = allArticles.findIndex((a) => a.id === selectedArticle.id);
		if (index !== -1) {
			allArticles[index] = updatedArticle;
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

		const result = await response.json();
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

		const result = await response.json();
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

		const result = await response.json();
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

	// Auto-refresh data every 30 seconds
	setInterval(loadData, 30000);
});
