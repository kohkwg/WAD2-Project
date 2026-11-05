const express = require("express");

const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));
app.get("/health", (req, res) => {
  res.json({
    status: true,
    message: "Server is running"
  });
});

// feature 1: recommendations + cover image uploads
app.use("/api/recommendations", require("./routes/recommendations"));
app.use("/api/uploads", require("./routes/uploads"));
// delete the signed-in user's own account (service-role, server only)
app.use("/api/account", require("./routes/account"));
// automatic event planner: programme + task suggestions from past events
app.use("/api/plan-suggestions", require("./routes/planSuggestions"));
// hangout late-join travel: onemap routes when onemap_email/onemap_password are set
app.use("/api/route", require("./routes/route"));
// food places near an event (go together before/after planner)
app.use("/api/food", require("./routes/food")());
// live hangouts: group-time ranking over private free times (members only)
app.use("/api/hangouts", require("./routes/hangouts"));
if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer from 1 to 65535");
  app.listen(port, "127.0.0.1", () => {
    console.log(`Server running on http://127.0.0.1:${port}`);
  });
}
module.exports = app;
