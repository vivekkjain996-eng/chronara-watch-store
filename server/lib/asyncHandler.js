// Express 4 doesn't forward a rejected promise from an async route handler to next(err)
// automatically - wrap handlers with this so DB/Cloudinary errors reach the error middleware
// instead of hanging the request.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
