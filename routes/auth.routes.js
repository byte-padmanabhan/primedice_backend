import { Router } from "express";
import  { getMe, login, logout, refreshToken, register } from "../controller/auth.controller.js";
const authRouter=Router();
authRouter.post("/register",register)
authRouter.post("/login",login)
authRouter.get("/me",getMe)
authRouter.post('/refresh-token',refreshToken); 
authRouter.post('/logout',logout);
export default authRouter;