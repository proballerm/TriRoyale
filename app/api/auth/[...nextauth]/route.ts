import NextAuth from "next-auth";
import { authOptions } from "@/lib/authOptions"; // or a relative path if needed

const handler = NextAuth(authOptions);

// ✅ Only export handlers from a Route Module
export { handler as GET, handler as POST };
