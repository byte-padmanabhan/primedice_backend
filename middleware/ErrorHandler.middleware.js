const errorMiddleware = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
  
    console.error(`[ERROR] ${statusCode}: ${err.message}`, err.errors || err.stack);
  
    res.status(statusCode).json({
      success: false,
      message: err.message || "Internal Server Error",
      errors: err.errors || [],
    });
  };
  
export default errorMiddleware;
  
//ApiError's only job — create an error object with a statusCode attached to it. That's it. A normal JS Error doesn't have statusCode. ApiError adds it.
//asyncHandler's only job — wrap every route in a try/catch so you don't have to write try/catch in every route. When it catches, it calls next(err) which is Express's way of saying "something went wrong, skip to error handler".
//Error middleware's only job — read that error object and send the response. It reads err.statusCode (which ApiError set) and err.message.