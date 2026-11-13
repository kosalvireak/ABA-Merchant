import { Router } from "express";
import { listProducts, findProduct } from "../data/products.js";

const router = Router();

// GET /api/products -> the full static product list
router.get("/", (_req, res) => {
  res.json(listProducts());
});

// GET /api/products/:id -> one product, or 404
router.get("/:id", (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) {
    return res.status(404).json({
      error: { code: "PRODUCT_NOT_FOUND", message: `Unknown product: ${req.params.id}` },
    });
  }
  res.json(product);
});

export default router;
