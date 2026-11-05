const express = require("express");
const supabase = require("../lib/supabase");
const requireAuth = require("../lib/requireAuth");

const router = express.Router();

// DELETE /api/account — permanently deletes the signed-in user's own account.
// Deleting an auth user needs the service-role key, which only the server holds, so the
// browser cannot do this itself. The token is verified by requireAuth; only that user's own id
// is ever deleted. Their profile and personal rows cascade away with the login.
// Events they organise block deletion (events.organiser_id is ON DELETE RESTRICT), so they
// must delete or hand over those events first rather than lose other people's RSVPs.
router.delete("/", requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    const { count, error: countError } = await supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("organiser_id", userId);
    if (countError) throw countError;
    if (count > 0) {
      return res.status(409).json({
        error: `You still organise ${count} event${count === 1 ? "" : "s"}. Delete ${count === 1 ? "it" : "them"} from My events first, then delete your account.`,
        organisedEvents: count,
      });
    }

    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;
    return res.json({ deleted: true });
  } catch (error) {
    console.error("[Account deletion error]", { message: error.message, code: error.code });
    return res.status(500).json({ error: "Could not delete your account. Please try again." });
  }
});

module.exports = router;
