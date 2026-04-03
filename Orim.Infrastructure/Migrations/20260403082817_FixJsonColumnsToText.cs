using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Orim.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FixJsonColumnsToText : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Repair any board elements that were stored without the $type discriminator.
            // Detection is based on element-specific properties (camelCase, as serialized by OrimJsonOptions):
            //   shapeType       → ShapeElement
            //   iconName        → IconElement
            //   imageUrl        → ImageElement
            //   sourceElementId → ArrowElement
            //   fillColor+color → StickyNoteElement
            //   text            → TextElement
            //   fillColor       → FrameElement (fallback)
            migrationBuilder.Sql("""
                UPDATE "Boards"
                SET "Elements" = (
                    SELECT jsonb_agg(
                        CASE
                            WHEN elem ? '$type'
                                THEN elem
                            WHEN elem ? 'shapeType'
                                THEN elem || '{"$type":"shape"}'
                            WHEN elem ? 'iconName'
                                THEN elem || '{"$type":"icon"}'
                            WHEN elem ? 'imageUrl'
                                THEN elem || '{"$type":"image"}'
                            WHEN elem ? 'sourceElementId'
                                THEN elem || '{"$type":"arrow"}'
                            WHEN (elem ? 'fillColor') AND (elem ? 'color')
                                THEN elem || '{"$type":"sticky"}'
                            WHEN elem ? 'text'
                                THEN elem || '{"$type":"text"}'
                            WHEN elem ? 'fillColor'
                                THEN elem || '{"$type":"frame"}'
                            ELSE elem
                        END
                    )
                    FROM jsonb_array_elements("Elements"::jsonb) AS elem
                )
                WHERE "Elements" IS NOT NULL
                  AND "Elements" <> 'null'
                  AND "Elements" <> '[]'
                  AND jsonb_typeof("Elements"::jsonb) = 'array';
                """);

            migrationBuilder.AlterColumn<string>(
                name: "StickyNotePresets",
                table: "Boards",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "jsonb");

            migrationBuilder.AlterColumn<string>(
                name: "RecentColors",
                table: "Boards",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "jsonb");

            migrationBuilder.AlterColumn<string>(
                name: "Elements",
                table: "Boards",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "jsonb");

            migrationBuilder.AlterColumn<string>(
                name: "CustomColors",
                table: "Boards",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "jsonb");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "StickyNotePresets",
                table: "Boards",
                type: "jsonb",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "RecentColors",
                table: "Boards",
                type: "jsonb",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "Elements",
                table: "Boards",
                type: "jsonb",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "CustomColors",
                table: "Boards",
                type: "jsonb",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");
        }
    }
}
