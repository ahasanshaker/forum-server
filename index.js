// backend/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.byszxkc.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("forumDB");
    const postsCollection = db.collection("posts");

    // Get all posts
    app.get("/posts", async (req, res) => {
      const posts = await postsCollection.find().sort({ _id: -1 }).toArray();
      res.send(posts);
    });

    // Get single post
    app.get("/posts/:id", async (req, res) => {
      const post = await postsCollection.findOne({ _id: new ObjectId(req.params.id) });
      if (!post) return res.status(404).send({ message: "Post not found" });
      res.send(post);
    });

    // Add new post
    app.post("/posts", async (req, res) => {
      const newPost = { ...req.body, upVote: 0, downVote: 0, comments: [] };
      const result = await postsCollection.insertOne(newPost);
      res.send(result);
    });

    // Update post
    app.put("/posts/:id", async (req, res) => {
      const updatedData = req.body;
      const result = await postsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: updatedData });
      if (result.matchedCount === 0) return res.status(404).send({ message: "Post not found" });
      res.send({ message: "Post updated successfully" });
    });

    // Delete post
    app.delete("/posts/:id", async (req, res) => {
      const result = await postsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      if (result.deletedCount === 0) return res.status(404).send({ message: "Post not found" });
      res.send({ message: "Post deleted successfully" });
    });

    // Upvote
    app.put("/posts/:id/upvote", async (req, res) => {
      await postsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $inc: { upVote: 1 } });
      res.send({ message: "Upvoted successfully" });
    });

    // Downvote
    app.put("/posts/:id/downvote", async (req, res) => {
      await postsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $inc: { downVote: 1 } });
      res.send({ message: "Downvoted successfully" });
    });

    // Add comment
    app.put("/posts/:id/comment", async (req, res) => {
      const { authorName, authorImage, text } = req.body;
      const newComment = { id: new ObjectId(), authorName, authorImage, text, time: new Date().toLocaleString() };
      await postsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $push: { comments: newComment } });
      res.send({ message: "Comment added successfully", comment: newComment });
    });

    console.log("✅ MongoDB Connected & API Ready");
  } catch (err) {
    console.error(err);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("Forum backend is running 🚀"));
app.listen(port, () => console.log(`Server listening on port ${port}`));
