"use client";

import { CameraIcon, Loader2Icon, Trash2Icon, XIcon } from "lucide-react";
import { useFilePicker } from "use-file-picker";
import {
  FileSizeValidator,
  FileTypeValidator,
} from "use-file-picker/validators";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/shadcnui/avatar";
import { Button } from "@/components/shadcnui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/shadcnui/card";

const AvatarUpload = () => {
  const { data: session, refetch } = authClient.useSession();
  const [saving, setSaving] = useState(false);
  const {
    openFilePicker,
    filesContent,
    plainFiles,
    errors,
    loading: pickerLoading,
    clear,
  } = useFilePicker({
    accept: "image/*",
    multiple: false,
    validators: [
      new FileSizeValidator({ maxFileSize: 2 * 1024 * 1024 }),
      new FileTypeValidator(["jpeg", "jpg", "png", "webp"]),
    ],
  });

  const currentImage = session?.user?.image;
  const preview = filesContent[0]?.content;
  const hasFile = filesContent.length > 0;
  const initials =
    session?.user?.name?.charAt(0).toUpperCase() ??
    session?.user?.email?.charAt(0).toUpperCase() ??
    "?";

  const handleSave = async () => {
    if (!plainFiles[0]) return;
    setSaving(true);
    try {
      const { createImage, deleteImage } = await import("@/server/imageAction");

      const url = await createImage(plainFiles[0]);
      const { error } = await authClient.updateUser({ image: url });

      if (error) {
        try {
          await deleteImage(url);
        } catch {
          toast.warning("The uploaded avatar could not be cleaned up");
        }
        toast.error(error.message ?? "Failed to update avatar");
        return;
      }

      let cleanupFailed = false;
      if (currentImage) {
        try {
          await deleteImage(currentImage);
        } catch {
          cleanupFailed = true;
        }
      }

      toast.success("Avatar updated");
      if (cleanupFailed) {
        toast.warning("Your previous avatar could not be removed from Cloudinary");
      }
      clear();
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to upload avatar");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!currentImage) return;
    setSaving(true);
    try {
      const { deleteImage } = await import("@/server/imageAction");
      const { error } = await authClient.updateUser({ image: null });

      if (error) {
        toast.error(error.message ?? "Failed to remove avatar");
        return;
      }

      let cleanupFailed = false;
      try {
        await deleteImage(currentImage);
      } catch {
        cleanupFailed = true;
      }

      toast.success("Avatar removed");
      if (cleanupFailed) {
        toast.warning("Your avatar was removed, but Cloudinary cleanup failed");
      }
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove avatar");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    clear();
  };

  const firstError = errors[0];
  const errorMessage =
    firstError?.name === "FileSizeError" ? "Image must be under 2MB"
    : firstError?.name === "FileTypeError" ?
      "File must be a JPEG, PNG, or WebP image"
    : null;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Avatar</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-6">
          <Avatar className="size-24">
            <AvatarImage
              src={hasFile ? preview : (currentImage ?? undefined)}
            />
            <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
          </Avatar>

          <div className="flex flex-col gap-2">
            {errorMessage && (
              <p className="text-destructive text-sm">{errorMessage}</p>
            )}

            {hasFile ?
              <>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  size="lg">
                  {saving ?
                    <Loader2Icon className="animate-spin" />
                  : <CameraIcon />}
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  size="lg"
                  disabled={saving}>
                  <XIcon />
                  Cancel
                </Button>
              </>
            : <>
                <Button
                  onClick={openFilePicker}
                  disabled={pickerLoading}
                  size="lg">
                  {pickerLoading ?
                    <Loader2Icon className="animate-spin" />
                  : <CameraIcon />}
                  {currentImage ? "Change" : "Upload"}
                </Button>
                {currentImage && (
                  <Button
                    onClick={handleRemove}
                    variant="outline"
                    size="lg"
                    disabled={saving}>
                    {saving ?
                      <Loader2Icon className="motion-safe:animate-spin" />
                    : <Trash2Icon />}
                    {saving ? "Removing…" : "Remove"}
                  </Button>
                )}
              </>
            }
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export { AvatarUpload };
