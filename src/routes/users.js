import express from "express";

const router = express.Router();

router.get("/me", (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
    },
  });
});

export default router;
