import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import Stripe from "stripe";

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
    // await client.connect();
    const db = client.db("forumDB");
    const postsCollection = db.collection("posts");
    const usersCollection = db.collection("users");
    const notificationsCollection = db.collection("notifications");

    // ✅ Save new user or return existing
    app.post("/users", async (req, res) => {
      const { email, name, image } = req.body;
      let user = await usersCollection.findOne({ email });

      if (!user) {
        user = {
          email,
          name,
          image,
          membership: "free",
          createdAt: new Date(),
        };
        await usersCollection.insertOne(user);
      }

      res.send(user);
    });

    // ✅ Upgrade to premium
    app.put("/users/:email/upgrade", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.updateOne(
        { email },
        { $set: { membership: "premium" } }
      );
      res.send({ message: "Upgraded to Premium!" });
    });

    // ✅ Middleware to check membership
    async function checkMembership(req, res, next) {
      const { authorEmail, authorName, authorImage } = req.body;
      let user = await usersCollection.findOne({ email: authorEmail });

      if (!user) {
        user = {
          email: authorEmail,
          name: authorName || "Anonymous",
          image: authorImage || "",
          membership: "free",
          createdAt: new Date(),
        };
        await usersCollection.insertOne(user);
      }

      if (user.membership === "free") {
        const postCount = await postsCollection.countDocuments({ authorEmail });
        if (postCount >= 5) {
          return res.status(403).send({ message: "Free users can only post 5 times. Upgrade to Premium!" });
        }
      }

      req.user = user;
      next();
    }

    // ✅ Posts routes
    app.get("/posts", async (req, res) => {
      const posts = await postsCollection.find().sort({ _id: -1 }).toArray();
      res.send(posts);
    });

    app.get("/posts/:id", async (req, res) => {
      const post = await postsCollection.findOne({ _id: new ObjectId(req.params.id) });
      if (!post) return res.status(404).send({ message: "Post not found" });
      res.send(post);
    });

    app.post("/posts", checkMembership, async (req, res) => {
      const { authorEmail, authorName, title, content } = req.body;
      const newPost = {
        authorEmail,
        authorName,
        title,
        content,
        upVote: 0,
        downVote: 0,
        comments: [],
        time: new Date().toLocaleString(),
      };

      const result = await postsCollection.insertOne(newPost);

      // notifications
      const otherUsers = await usersCollection.find({ email: { $ne: authorEmail } }).toArray();
      const notifications = otherUsers.map(user => ({
        userEmail: user.email,
        type: "new_post",
        message: `${authorName} added a new post: ${title}`,
        read: false,
        createdAt: new Date(),
      }));

      if (notifications.length) await notificationsCollection.insertMany(notifications);

      res.send(result);
    });

    app.put("/posts/:id", async (req, res) => {
      const updatedData = req.body;
      const result = await postsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: updatedData }
      );
      if (result.matchedCount === 0) return res.status(404).send({ message: "Post not found" });
      res.send({ message: "Post updated successfully" });
    });

    app.delete("/posts/:id", async (req, res) => {
      const result = await postsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      if (result.deletedCount === 0) return res.status(404).send({ message: "Post not found" });
      res.send({ message: "Post deleted successfully" });
    });

    // ✅ Votes
    app.put("/posts/:id/upvote", async (req, res) => {
      await postsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $inc: { upVote: 1 } });
      res.send({ message: "Upvoted successfully" });
    });

    app.put("/posts/:id/downvote", async (req, res) => {
      await postsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $inc: { downVote: 1 } });
      res.send({ message: "Downvoted successfully" });
    });

    // ✅ Comments
    app.put("/posts/:id/comment", async (req, res) => {
      const { authorName, authorImage, text } = req.body;
      const newComment = {
        id: new ObjectId(),
        authorName,
        authorImage,
        text,
        time: new Date().toLocaleString(),
      };
      await postsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $push: { comments: newComment } }
      );
      res.send({ message: "Comment added successfully", comment: newComment });
    });

    // ✅ Stripe
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    app.post("/create-checkout-session", async (req, res) => {
      const { email } = req.body;
      try {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: { name: "Premium Membership" },
                unit_amount: 2000,
              },
              quantity: 1,
            },
          ],
          success_url: `https://forum-server-gilt.vercel.app/membership?success=true&email=${email}`,
          cancel_url: `https://forum-server-gilt.vercel.app/membership?canceled=true`,
        });
        res.json({ id: session.id, url: session.url });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ✅ Notifications
    app.get("/notifications/:email", async (req, res) => {
      const email = req.params.email;
      const notifications = await notificationsCollection
        .find({ userEmail: email })
        .sort({ createdAt: -1 })
        .toArray();
      const unreadCount = await notificationsCollection.countDocuments({ userEmail: email, read: false });
      res.send({ notifications, unreadCount });
    });

    app.put("/notifications/:email/read", async (req, res) => {
      const email = req.params.email;
      await notificationsCollection.updateMany({ userEmail: email, read: false }, { $set: { read: true } });
      res.send({ message: "Notifications marked as read" });
    });

    console.log("✅ MongoDB Connected & API Ready");
  } catch (err) {
    console.error(err);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("Forum backend is running 🚀"));
app.listen(port, () => console.log(`Server listening on port ${port}`));
