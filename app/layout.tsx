import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import NavBar from "@/components/layout/NavBar";
import Container from "@/components/layout/Container";
import SocketProvide from "@/providers/SocketProvide";
import { cn } from "@/lib/utils";

const inter=Inter({subsets:['latin']});

export const metadata: Metadata = {
  title: "VideoChat",
  description: "Video Calling PLatform ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
    <html lang="en">
      <body
        className={cn(inter.className,'relative')}
      >
        <SocketProvide>

        
        <main className=" flex flex-col min-h-screen bg-secondary" >
          <NavBar/>
          <Container>
          {children}
          </Container>
        
        </main>
        {/* {children} */}
        </SocketProvide>
      </body>
    </html>
    </ClerkProvider>
  );
}
