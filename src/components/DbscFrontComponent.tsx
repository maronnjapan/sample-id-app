'use client'
import { sortUlid } from "@/util";
import Image from "next/image";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";

export function DbscFrontComponent({ isLogin }: { isLogin?: boolean }) {
    const [isLoggedIn, setIsLoggedIn] = useState(isLogin || false);

    // State for DBSC cookie tracking
    const [cookie, setCookie] = useState<{ id: string, value: string }[]>([]);

    const fetchData = async () => {
        const res = await fetch('/api/dummy');
    };

    const convertCookieToStringList = (cookie: string) => {
        const cookieList = cookie.split('; ');

        const pattern = /^[0-9A-Z]{26}/;
        return cookieList.filter(val => pattern.test(val)).map((item) => {
            return item.split('=');
        }).sort((a, b) => b[0].localeCompare(a[0])).map(val => {
            return [val[0], decodeURIComponent(val[1])];
        });
    };

    const startCookieTracker = () => {
        const timer = setInterval(() => {
            setCookie((prev) => {
                const cookieString = document.cookie;
                const cookies = convertCookieToStringList(cookieString);
                const addCookies = cookies.filter((item) => {
                    return !prev.some((prevItem) => prevItem.id === item[0]);
                }).map((item) => {
                    return {
                        id: item[0],
                        value: item[1]
                    };
                });
                if (!cookieString.includes('auth_cookie') && prev[0] && !prev[0].value.endsWith('Cookie Expired')) {
                    return [{ id: sortUlid(), value: 'Cookie Expired' }, ...addCookies, ...prev];
                }
                return [...addCookies, ...prev];
            });
        }, 500);
        return () => clearInterval(timer);
    };

    // Only start tracking cookies after login
    useEffect(() => {
        if (isLoggedIn) {
            return startCookieTracker();
        }
    }, [isLoggedIn]);

    if (!isLoggedIn) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
                    <Link href="/auth/login" className="flex items-center justify-center mb-4">
                        <button
                            className="w-full px-4 py-2 text-white bg-blue-500 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                        >
                            ログイン
                        </button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="items-center justify-items-center min-h-screen p-8 pb-20 gap-16 font-[family-name:var(--font-geist-sans)]">
            <main className="flex flex-col gap-2 row-start-2 sm:items-start flex-wrap w-full">
                <div className="mb-6 flex justify-between items-center w-full">
                    <h1 className="text-2xl font-bold">DBSC Session Management</h1>
                    <button
                        className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
                        onClick={() => {
                            document.cookie.split(';').forEach(c => {
                                document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
                            });
                            setIsLoggedIn(false);
                        }}
                    >
                        Logout
                    </button>
                </div>
                <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" onClick={fetchData}>Fetch Data</button>
                {
                    cookie.map((item, index) => {
                        return (
                            <Fragment key={item.id}>
                                <div className="w-full flex gap-2 justify-stretch">
                                    <div>
                                        {item.value.split('\n\r').map((val, index) => {
                                            return (
                                                <p key={index} className={`
                                                w-[800] ${index === 0 ? 'whitespace-pre-wrap' : 'whitespace-nowrap'} truncate
                                                `}>{val}</p>
                                            )
                                        }
                                        )}
                                    </div>
                                    <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" onClick={async () => {
                                        await navigator.clipboard.writeText(item.value)
                                        alert('copied to clipboard')
                                    }}>Copy</button>
                                </div>
                                <hr className="w-full h-0.5 border-gray-300" />
                            </Fragment>
                        )
                    }
                    )
                }
            </main>
        </div>
    );
}
