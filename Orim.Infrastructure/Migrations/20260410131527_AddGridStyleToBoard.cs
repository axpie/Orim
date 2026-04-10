using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Orim.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGridStyleToBoard : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GridStyle",
                table: "Boards",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GridStyle",
                table: "Boards");
        }
    }
}
