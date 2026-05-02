import { Router, type IRouter } from "express";
import healthRouter from "./health";
import legalRouter from "./legal";
import bannersRouter from "./banners";
import manufacturersRouter from "./manufacturers";
import categoriesRouter from "./categories";
import productsRouter from "./products";

const router: IRouter = Router();

router.use(healthRouter);
router.use(legalRouter);
router.use(bannersRouter);
router.use(manufacturersRouter);
router.use(categoriesRouter);
router.use(productsRouter);

export default router;
