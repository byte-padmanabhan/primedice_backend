import dotenv from 'dotenv';
dotenv.config();    
import express from "express"
import betRouter from './routes/bet.routes.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import errorMiddleware from './middleware/ErrorHandler.middleware.js';
import connectDB from './db.js';
import authRouter from './routes/auth.routes.js';
const app=express()
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',  // tighten this in production
    methods: ['GET', 'POST']
  }
});
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
//this is the socket setup here 
import { autoBetSocket } from './sockets/sockets.js';
io.on('connection', (socket) => {
  console.log('user connected:', socket.id);
  autoBetSocket(io, socket);

  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
  });
});
connectDB()
app.listen(PORT,()=>
{
    console.log(`the server is running on port ${PORT}`)
})