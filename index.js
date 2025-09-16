import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.byszxkc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("forumDB");
    const postsCollection = db.collection("posts");

    // ✅ Get all posts
    app.get("/posts", async (req, res) => {
      const posts = await postsCollection.find().sort({ _id: -1 }).toArray();
      res.send(posts);
    });

    // ✅ Get single post by id
    app.get("/posts/:id", async (req, res) => {
      const id = req.params.id;
      const post = await postsCollection.findOne({ _id: new ObjectId(id) });
      if (!post) {
        return res.status(404).send({ message: "Post not found" });
      }
      res.send(post);
    });

    // ✅ Add new post
    app.post("/posts", async (req, res) => {
      const newPost = req.body;
      const result = await postsCollection.insertOne(newPost);
      res.send(result);
    });

    console.log("✅ MongoDB Connected & API Ready");
  } catch (error) {
    console.error(error);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Forum backend is running 🚀");
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
