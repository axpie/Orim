using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Orim.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBoardIconGroups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EnabledIconGroups",
                table: "Boards",
                type: "text",
                nullable: false,
                defaultValue: "[\"infrastructure\",\"software\",\"consulting\",\"security\",\"analytics\",\"navigation\"]");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EnabledIconGroups",
                table: "Boards");
        }
    }
}
