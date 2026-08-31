"use client";
export default function AuthActions() { async function logout() { await fetch("/api/auth/logout", { method:"POST" }); window.location.assign("/login"); } return <button className="logout-button" type="button" onClick={logout}>退出登录</button>; }
