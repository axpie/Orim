using Orim.Core.Models;

namespace Orim.Core.Services;

public static class BoardTemplateCatalog
{
    public const string BlankTemplateId = "blank";
    public const string WelcomeTemplateId = "welcome-board";
    public const string ProcessTemplateId = "process-flow";
    public const string OrgChartTemplateId = "org-chart";
    public const string SwimlaneTemplateId = "swimlane";
    public const string DecisionTreeTemplateId = "decision-tree";
    public const string WorkshopTemplateId = "workshop-board";

    public static IReadOnlyList<BoardTemplateDefinition> Definitions { get; } =
    [
        new(BlankTemplateId, "Dashboard", "TemplateBlankTitle", "TemplateBlankDescription"),
        new(WelcomeTemplateId, "School", "TemplateWelcomeTitle", "TemplateWelcomeDescription"),
        new(ProcessTemplateId, "AltRoute", "TemplateProcessTitle", "TemplateProcessDescription"),
        new(OrgChartTemplateId, "AccountTree", "TemplateOrgChartTitle", "TemplateOrgChartDescription"),
        new(SwimlaneTemplateId, "ViewWeek", "TemplateSwimlaneTitle", "TemplateSwimlaneDescription"),
        new(DecisionTreeTemplateId, "AccountTree", "TemplateDecisionTreeTitle", "TemplateDecisionTreeDescription"),
        new(WorkshopTemplateId, "DynamicFeed", "TemplateWorkshopTitle", "TemplateWorkshopDescription")
    ];

    public static bool IsKnownTemplate(string? templateId) =>
        string.IsNullOrWhiteSpace(templateId) || Definitions.Any(template => template.Id == templateId);

    public static List<BoardElement> CreateElements(string? templateId)
    {
        var normalizedTemplateId = string.IsNullOrWhiteSpace(templateId) ? BlankTemplateId : templateId;
        var elements = normalizedTemplateId switch
        {
            WelcomeTemplateId => CreateWelcomeTemplate(),
            ProcessTemplateId => CreateProcessFlowTemplate(),
            OrgChartTemplateId => CreateOrgChartTemplate(),
            SwimlaneTemplateId => CreateSwimlaneTemplate(),
            DecisionTreeTemplateId => CreateDecisionTreeTemplate(),
            WorkshopTemplateId => CreateWorkshopTemplate(),
            _ => []
        };

        NormalizeZIndices(elements);
        return elements;
    }

    private static void NormalizeZIndices(List<BoardElement> elements)
    {
        elements.Sort((a, b) => a.ZIndex.CompareTo(b.ZIndex));
        for (var index = 0; index < elements.Count; index++)
        {
            elements[index].ZIndex = index;
        }
    }

    private static List<BoardElement> CreateProcessFlowTemplate()
    {
        var start = Shape("Start", 120, 120, 160, 80, ShapeType.Ellipse, "#DCFCE7");
        var analyze = Shape("Analyse", 380, 120, 180, 90, ShapeType.Rectangle, "#DBEAFE");
        var decision = Shape("Entscheidung", 670, 110, 180, 110, ShapeType.Triangle, "#FEF3C7");
        var finish = Shape("Abschluss", 930, 120, 170, 80, ShapeType.Ellipse, "#FCE7F3");

        return
        [
            start,
            analyze,
            decision,
            finish,
            Arrow(start, DockPoint.Right, analyze, DockPoint.Left),
            Arrow(analyze, DockPoint.Right, decision, DockPoint.Left),
            Arrow(decision, DockPoint.Right, finish, DockPoint.Left),
            Text("Nutze dieses Board als Ausgangspunkt fuer Prozessdiagramme.", 120, 260, 500, 40, "#334155")
        ];
    }

    private static List<BoardElement> CreateWelcomeTemplate()
    {
        var title = Text("Willkommen bei ORIM", 120, 60, 540, 48, "#0F172A");
        title.FontSize = 32;
        title.IsBold = true;

        var stepOne = Shape("1. Klicke eine Form an", 120, 180, 260, 110, ShapeType.Rectangle, "#DBEAFE");
        var stepTwo = Shape("2. Ziehe Elemente frei", 450, 180, 260, 110, ShapeType.Rectangle, "#DCFCE7");
        var stepThree = Shape("3. Teile dein Board", 780, 180, 260, 110, ShapeType.Rectangle, "#FCE7F3");
        var note = Shape("Probiere danach Kommentare, Farben und Vorlagen aus.", 285, 390, 590, 110, ShapeType.Rectangle, "#FEF3C7");

        var arrowOne = Arrow(stepOne, DockPoint.Right, stepTwo, DockPoint.Left);
        arrowOne.Label = "bearbeiten";

        var arrowTwo = Arrow(stepTwo, DockPoint.Right, stepThree, DockPoint.Left);
        arrowTwo.Label = "zusammenarbeiten";

        var helper = Text("Dieses Starter-Board fuehrt dich durch die ersten drei Aktionen, die neue Teams am schnellsten produktiv machen.", 120, 560, 880, 56, "#334155");
        helper.FontSize = 22;

        return
        [
            title,
            stepOne,
            stepTwo,
            stepThree,
            note,
            arrowOne,
            arrowTwo,
            helper
        ];
    }

    private static List<BoardElement> CreateOrgChartTemplate()
    {
        var leadership = Shape("Leitung", 470, 80, 220, 90, ShapeType.Rectangle, "#E0E7FF");
        var operations = Shape("Operations", 180, 280, 220, 90, ShapeType.Rectangle, "#DBEAFE");
        var product = Shape("Produkt", 470, 280, 220, 90, ShapeType.Rectangle, "#DCFCE7");
        var sales = Shape("Vertrieb", 760, 280, 220, 90, ShapeType.Rectangle, "#FCE7F3");

        return
        [
            leadership,
            operations,
            product,
            sales,
            Arrow(leadership, DockPoint.Bottom, operations, DockPoint.Top),
            Arrow(leadership, DockPoint.Bottom, product, DockPoint.Top),
            Arrow(leadership, DockPoint.Bottom, sales, DockPoint.Top),
            Text("Passe Rollen, Teams oder Berichtslinien direkt an.", 180, 410, 520, 36, "#334155")
        ];
    }

    private static List<BoardElement> CreateSwimlaneTemplate()
    {
        var laneA = Shape("Team A", 80, 80, 1080, 170, ShapeType.Rectangle, "#F8FAFC", "#94A3B8", 1);
        var laneB = Shape("Team B", 80, 280, 1080, 170, ShapeType.Rectangle, "#F8FAFC", "#94A3B8", 1);
        var idea = Shape("Idee", 210, 125, 180, 70, ShapeType.Rectangle, "#DBEAFE");
        var review = Shape("Review", 530, 125, 180, 70, ShapeType.Rectangle, "#FEF3C7");
        var release = Shape("Release", 860, 325, 180, 70, ShapeType.Rectangle, "#DCFCE7");

        return
        [
            laneA,
            laneB,
            idea,
            review,
            release,
            Arrow(idea, DockPoint.Right, review, DockPoint.Left),
            Arrow(review, DockPoint.Bottom, release, DockPoint.Top),
            Text("Swimlanes helfen bei teamuebergreifenden Prozessdarstellungen.", 130, 475, 620, 36, "#334155")
        ];
    }

    private static List<BoardElement> CreateDecisionTreeTemplate()
    {
        var question = Shape("Anfrage eingehen?", 470, 90, 220, 90, ShapeType.Rectangle, "#DBEAFE");
        var split = Shape("Freigabe?", 470, 260, 220, 110, ShapeType.Triangle, "#FEF3C7");
        var yes = Shape("Umsetzen", 220, 470, 200, 80, ShapeType.Rectangle, "#DCFCE7");
        var no = Shape("Rueckfrage", 760, 470, 200, 80, ShapeType.Rectangle, "#FCE7F3");

        var toDecision = Arrow(question, DockPoint.Bottom, split, DockPoint.Top);
        toDecision.Label = "ja";

        var toYes = Arrow(split, DockPoint.Left, yes, DockPoint.Top);
        toYes.Label = "ja";

        var toNo = Arrow(split, DockPoint.Right, no, DockPoint.Top);
        toNo.Label = "nein";

        return
        [
            question,
            split,
            yes,
            no,
            toDecision,
            toYes,
            toNo,
            Text("Ersetze die Beschriftungen durch deine Fachlogik.", 300, 600, 420, 36, "#334155")
        ];
    }

    private static List<BoardElement> CreateWorkshopTemplate()
    {
        return
        [
            Shape("Ziel", 120, 100, 220, 110, ShapeType.Rectangle, "#FCE7F3"),
            Shape("Ideen", 410, 100, 220, 110, ShapeType.Rectangle, "#DBEAFE"),
            Shape("Naechste Schritte", 700, 100, 260, 110, ShapeType.Rectangle, "#DCFCE7"),
            Shape("Offene Fragen", 120, 280, 220, 110, ShapeType.Rectangle, "#FEF3C7"),
            Shape("Risiken", 410, 280, 220, 110, ShapeType.Rectangle, "#FEE2E2"),
            Shape("Owner", 700, 280, 260, 110, ShapeType.Rectangle, "#E0E7FF"),
            Text("Workshop-Board mit typischen Cluster-Feldern fuer Moderation und Nachbereitung.", 120, 450, 760, 42, "#334155")
        ];
    }

    private static ShapeElement Shape(
        string label,
        double x,
        double y,
        double width,
        double height,
        ShapeType shapeType,
        string fillColor,
        string strokeColor = "#334155",
        double strokeWidth = 2) => new()
        {
            X = x,
            Y = y,
            Width = width,
            Height = height,
            Label = label,
            ShapeType = shapeType,
            FillColor = fillColor,
            StrokeColor = strokeColor,
            StrokeWidth = strokeWidth
        };

    private static TextElement Text(string text, double x, double y, double width, double height, string color) => new()
    {
        X = x,
        Y = y,
        Width = width,
        Height = height,
        Text = text,
        Color = color,
        FontSize = 20
    };

    private static ArrowElement Arrow(BoardElement source, DockPoint sourceDock, BoardElement target, DockPoint targetDock) => new()
    {
        SourceElementId = source.Id,
        TargetElementId = target.Id,
        SourceDock = sourceDock,
        TargetDock = targetDock,
        StrokeColor = "#475569",
        StrokeWidth = 2
    };
}
