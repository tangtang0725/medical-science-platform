# 零依赖 Node 应用：直接用官方镜像，无需 npm install
FROM node:22-alpine
WORKDIR /app
COPY . .
# 云平台通过 PORT 环境变量注入端口（Railway/Render/Fly 均支持）
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
