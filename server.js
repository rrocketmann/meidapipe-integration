const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const port = process.env.PORT || 8000;

const MAX_POSTS = 50;
const DATA_DIR = path.join(__dirname, "data");
const POSTS_FILE = path.join(DATA_DIR, "community-posts.json");

app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

async function ensurePostsFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(POSTS_FILE);
  } catch {
    await fs.writeFile(POSTS_FILE, "[]", "utf8");
  }
}

async function readPosts() {
  await ensurePostsFile();
  try {
    const raw = await fs.readFile(POSTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((post) => typeof post?.imageDataUrl === "string" && typeof post?.sharedAt === "string")
      .slice(0, MAX_POSTS);
  } catch {
    return [];
  }
}

async function writePosts(posts) {
  await ensurePostsFile();
  await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2), "utf8");
}

app.get("/api/community-posts", async (_req, res) => {
  const posts = await readPosts();
  res.json({ posts });
});

app.post("/api/community-posts", async (req, res) => {
  const imageDataUrl = req.body?.imageDataUrl;
  if (typeof imageDataUrl !== "string" || imageDataUrl.length === 0) {
    return res.status(400).json({ error: "imageDataUrl is required" });
  }

  const sharedAt = new Date().toISOString();
  const newPost = { imageDataUrl, sharedAt };

  const existingPosts = await readPosts();
  const updatedPosts = [newPost, ...existingPosts].slice(0, MAX_POSTS);
  await writePosts(updatedPosts);

  return res.status(201).json({ post: newPost, posts: updatedPosts });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`Hanvas server running on port ${port}`);
});
