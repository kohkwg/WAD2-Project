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
// Delete the signed-in user's own account (service-role, server only)
app.use("/api/account", require("./routes/account"));
// Automatic event planner: programme + task suggestions from past events
app.use("/api/plan-suggestions", require("./routes/planSuggestions"));
// Hangout late-join travel: OneMap routes when ONEMAP_EMAIL/ONEMAP_PASSWORD are set
app.use("/api/route", require("./routes/route"));
// Food deals and places near an event (Go together before/after planner)
app.use("/api/food", require("./routes/food")());
// Live hangouts: group-time ranking over private free times (members only)
app.use("/api/hangouts", require("./routes/hangouts"));

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer from 1 to 65535");
  app.listen(port, "127.0.0.1", () => {
    console.log(`Server running on http://127.0.0.1:${port}`);
  });
}

module.exports = app;
