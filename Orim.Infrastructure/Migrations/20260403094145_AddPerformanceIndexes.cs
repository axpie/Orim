using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Orim.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPerformanceIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Boards_CreatedAt",
                table: "Boards",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_BoardMembers_UserId",
                table: "BoardMembers",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Boards_CreatedAt",
                table: "Boards");

            migrationBuilder.DropIndex(
                name: "IX_BoardMembers_UserId",
                table: "BoardMembers");
        }
    }
}
