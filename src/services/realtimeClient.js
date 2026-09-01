import { io } from "socket.io-client";
import { API_BASE_URL, getAccessToken } from "./apiClient";

const getSocketBaseUrl = () => API_BASE_URL.replace(/\/api\/v\d+\/?$/, "");

let socket;

export const getRealtimeSocket = () => {
  if (!socket) {
    socket = io(getSocketBaseUrl(), {
      autoConnect: true,
      auth: {
        token: getAccessToken()
      },
      transports: ["websocket", "polling"]
    });

    socket.io.on("reconnect_attempt", () => {
      socket.auth = {
        token: getAccessToken()
      };
    });
  }

  return socket;
};
