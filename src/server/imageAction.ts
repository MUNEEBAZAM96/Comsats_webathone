"use server";

import { createHash, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { v2 as cloudinary } from "cloudinary";
import { auth } from "@/lib/auth";
import { serverEnv } from "@/lib/env/serverEnv";
import sharp from "sharp";

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const AVATAR_FOLDER = "avatars";
const MANAGED_AVATAR_RE =
  /^examguard-avatar-([0-9a-f]{20})-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

const getCloudinaryConfig = () => {
  const cloudName = serverEnv.CLOUDINARY_CLOUD_NAME;
  const apiKey = serverEnv.CLOUDINARY_API_KEY;
  const apiSecret = serverEnv.CLOUDINARY_API_SECRET;
  const folderMode = serverEnv.CLOUDINARY_FOLDER_MODE?.trim().toLowerCase();

  if (!cloudName || !apiKey || !apiSecret || !folderMode) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, and CLOUDINARY_FOLDER_MODE.",
    );
  }

  const folderModeType =
    folderMode.includes("dynamic") ? "dynamic"
    : folderMode.includes("fixed") || folderMode.includes("legacy") ? "fixed"
    : null;

  if (!folderModeType) {
    throw new Error(
      'CLOUDINARY_FOLDER_MODE must describe either "dynamic" or "fixed" folders.',
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  return { cloudName, folderMode: folderModeType };
};

const getOwnerTag = (userId: string) =>
  createHash("sha256").update(userId).digest("hex").slice(0, 20);

const getManagedAvatar = (imageUrl: string) => {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") {
    return null;
  }

  const [cloudName, resourceType, deliveryType, ...pathSegments] =
    url.pathname.split("/").filter(Boolean);
  if (
    cloudName === undefined ||
    resourceType !== "image" ||
    deliveryType !== "upload"
  ) {
    return null;
  }

  if (pathSegments[0] && /^v\d+$/.test(pathSegments[0])) {
    pathSegments.shift();
  }

  const fileName = pathSegments.pop();
  if (!fileName?.endsWith(".jpg")) return null;

  const publicId = fileName.slice(0, -4);
  const managedAvatar = MANAGED_AVATAR_RE.exec(publicId);
  if (!managedAvatar) return null;

  const folders = pathSegments.join("/");
  if (folders && folders !== AVATAR_FOLDER) return null;

  return {
    cloudName,
    ownerTag: managedAvatar[1].toLowerCase(),
    publicId: [...pathSegments, publicId].join("/"),
  };
};

export const createImage = async (imageFile: File) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  if (imageFile.size > MAX_AVATAR_SIZE)
    throw new Error("Image must be under 2MB");

  const inputBuffer = Buffer.from(await imageFile.arrayBuffer());
  const metadata = await sharp(inputBuffer).metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) {
    throw new Error("File must be a JPEG, PNG, or WebP image");
  }

  const imageBuffer = await sharp(inputBuffer)
    .resize({
      width: 640,
      height: 360,
    })
    .jpeg({
      quality: 87,
      mozjpeg: true,
    })
    .toBuffer();

  const { cloudName, folderMode } = getCloudinaryConfig();
  const ownerTag = getOwnerTag(session.user.id);
  const publicId = `examguard-avatar-${ownerTag}-${randomUUID()}`;
  const folderOptions =
    folderMode === "dynamic" ?
      { asset_folder: AVATAR_FOLDER }
    : { folder: AVATAR_FOLDER };
  const uploaded = await cloudinary.uploader.upload(
    `data:image/jpeg;base64,${imageBuffer.toString("base64")}`,
    {
      resource_type: "image",
      public_id: publicId,
      overwrite: false,
      format: "jpg",
      allowed_formats: ["jpg"],
      ...folderOptions,
    },
  );

  if (
    !uploaded.secure_url.startsWith(
      `https://res.cloudinary.com/${cloudName}/image/upload/`,
    )
  ) {
    throw new Error("Cloudinary returned an unexpected avatar URL");
  }

  return uploaded.secure_url;
};

export const deleteImage = async (imageUrl: string): Promise<boolean> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const avatar = getManagedAvatar(imageUrl);
  if (!avatar) return false;

  const { cloudName } = getCloudinaryConfig();
  if (avatar.cloudName !== cloudName) return false;

  if (
    avatar.ownerTag !== getOwnerTag(session.user.id) &&
    session.user.role !== "admin"
  ) {
    throw new Error("Unauthorized");
  }

  const result = await cloudinary.uploader.destroy(avatar.publicId, {
    resource_type: "image",
    invalidate: true,
  });
  if (result.result !== "ok" && result.result !== "not found") {
    throw new Error("Cloudinary could not delete the avatar");
  }

  return true;
};
