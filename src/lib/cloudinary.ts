import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "gksfzjxf",
  api_key: process.env.CLOUDINARY_API_KEY || "659211597593824",
  api_secret: process.env.CLOUDINARY_API_SECRET || "mOEj9H8QBBMNkdif3M8UMiPtrzY",
  secure: true,
});

export default cloudinary;
