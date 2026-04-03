using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Orim.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddFoldersAndTags : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FolderId",
                table: "Boards",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Tags",
                table: "Boards",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "BoardFolders",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentFolderId = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardFolders", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BoardFolders_OwnerId",
                table: "BoardFolders",
                column: "OwnerId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BoardFolders");

            migrationBuilder.DropColumn(
                name: "FolderId",
                table: "Boards");

            migrationBuilder.DropColumn(
                name: "Tags",
                table: "Boards");
        }
    }
}
