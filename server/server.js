const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
  res.json({ status: true, message: "Server is running" });
});

// Feature 1: recommendations + cover image uploads
app.use("/api/recommendations", require("./routes/recommendations"));
app.use("/api/uploads", require("./routes/uploads"));

app.listen(3000, "127.0.0.1", () => {
  console.log("Server running on http://127.0.0.1:3000");
});
