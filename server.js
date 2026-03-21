import dotenv from 'dotenv';
dotenv.config();    
import express from "express"
import betRouter from './routes/bet.routes.js';
import errorMiddleware from './middleware/ErrorHandler.middleware.js';
import connectDB from './db.js';
import authRouter from './routes/auth.routes.js';
const app=express()
app.use(express.json())
const PORT=8080
app.get("/",(req,res)=>
{
    res.send("hello from the server")
})
//put all the routes here 
app.use('/api/auth', authRouter);
app.use('/api/bet', betRouter);
//finally you will have an error middleware
app.use(errorMiddleware);
connectDB()
app.listen(PORT,()=>
{
    console.log(`the server is running on port ${PORT}`)
})