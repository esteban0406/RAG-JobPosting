import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const RegisterStep1Schema = z.object({
  name: z.string().min(1, "Full name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type RegisterStep1Input = z.infer<typeof RegisterStep1Schema>;

export const RegisterStep2Schema = z.object({
  skills: z.array(z.string()),
  preferredFields: z.array(z.string()),
  location: z.string().optional(),
});
export type RegisterStep2Input = z.infer<typeof RegisterStep2Schema>;

export const ProfileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  location: z.string().optional(),
  skills: z.array(z.string()),
  preferredFields: z.array(z.string()),
});
export type ProfileInput = z.infer<typeof ProfileSchema>;
