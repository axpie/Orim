# Stage 1: Build SPA
FROM node:20 AS spa-build
WORKDIR /app/orim-spa
COPY orim-spa/package*.json ./
RUN npm ci
COPY orim-spa ./
RUN npm run build

# Stage 2: Build .NET backend
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Orim.slnx ./
COPY Orim.Api/ Orim.Api/
COPY Orim.Core/ Orim.Core/
COPY Orim.Infrastructure/ Orim.Infrastructure/
COPY Orim.Tests/ Orim.Tests/
COPY --from=spa-build /app/orim-spa/dist/ Orim.Api/wwwroot/
RUN dotnet restore Orim.Api/Orim.Api.csproj
RUN dotnet publish Orim.Api/Orim.Api.csproj -c Release -o /app/publish

# Stage 3: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
COPY THIRD-PARTY-NOTICES.md .
ENV ASPNETCORE_URLS=http://+:5000
EXPOSE 5000
ENTRYPOINT ["dotnet", "Orim.Api.dll"]
