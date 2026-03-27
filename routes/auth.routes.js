import { Router } from "express";
import  { getMe, login, logout, refreshToken, register } from "../controller/auth.controller.js";
import authenticate from "../middleware/auth.middleware.js";
const authRouter=Router();
authRouter.post("/register",register)
authRouter.post("/login",login)
authRouter.get("/me",authenticate,getMe)
authRouter.post('/refresh-token',refreshToken); 
authRouter.post('/logout',authenticate,logout);
export default authRouter;