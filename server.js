import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import connectDB from './db.js';
import authRouter from './routes/auth.routes.js';
import betRouter from './routes/bet.routes.js';
import errorMiddleware from './middleware/ErrorHandler.middleware.js';
import { autoBetSocket } from './sockets/sockets.js';

const app = express();
const httpServer = createServer(app);

const allowedOrigins = [
  'http://localhost:5173',
];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  }
});

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => res.send('hello from the server'));

app.use('/api/auth', authRouter);
app.use('/api/bet', betRouter);

app.use(errorMiddleware);

io.on('connection', (socket) => {
  console.log('user connected:', socket.id);
  autoBetSocket(io, socket);
  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
  });
});

connectDB().then(() => {
  httpServer.listen(process.env.PORT || 8080, () => {
    console.log(`Server running on port ${process.env.PORT || 8080}`);
  });
});