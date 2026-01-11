import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const BASE_URL = "https://arwfloridablanca.shop";

serve(async (req: Request): Promise<Response> => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Try to get the latest successful sitemap from logs
    const { data: latestLog, error: logError } = await supabase
      .from("sitemap_logs")
      .select("sitemap_content, generated_at")
      .eq("success", true)
      .not("sitemap_content", "is", null)
      .order("generated_at", { ascending: false })
      .limit(1)
      .single();

    if (!logError && latestLog?.sitemap_content) {
      console.log(`Serving cached sitemap from ${latestLog.generated_at}`);
      return new Response(latestLog.sitemap_content, {
        status: 200,
        headers: {
          "Content-Type": "application/xml",
          "Cache-Control": "public, max-age=3600", // Cache for 1 hour
        },
      });
    }

    // No cached sitemap found, generate fresh one
    console.log("No cached sitemap found, generating fresh...");

    // Fetch active products with slugs
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("slug, updated_at")
      .eq("is_active", true)
      .is("archived_at", null)
      .not("slug", "is", null);

    if (productsError) {
      console.error("Error fetching products:", productsError);
      throw productsError;
    }

    // Fetch active categories
    const { data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select("id, name, updated_at")
      .eq("is_active", true)
      .is("archived_at", null);

    if (categoriesError) {
      console.error("Error fetching categories:", categoriesError);
      throw categoriesError;
    }

    const now = new Date().toISOString();
    const urls: { loc: string; lastmod: string; priority: string; changefreq: string }[] = [];

    // Add static pages
    urls.push({
      loc: BASE_URL,
      lastmod: now,
      priority: "1.0",
      changefreq: "daily",
    });

    urls.push({
      loc: `${BASE_URL}/order`,
      lastmod: now,
      priority: "0.9",
      changefreq: "daily",
    });

    // Add category pages
    const categoryUrls = (categories || []).map((cat) => ({
      loc: `${BASE_URL}/order?category=${encodeURIComponent(cat.name)}`,
      lastmod: cat.updated_at || now,
      priority: "0.8",
      changefreq: "weekly",
    }));
    urls.push(...categoryUrls);

    // Add product pages
    const productUrls = (products || []).map((product) => ({
      loc: `${BASE_URL}/product/${product.slug}`,
      lastmod: product.updated_at || now,
      priority: "0.7",
      changefreq: "weekly",
    }));
    urls.push(...productUrls);

    // Generate XML
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod.split("T")[0]}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

    console.log(`Generated fresh sitemap with ${urls.length} URLs`);

    // Store this generated sitemap for future requests
    await supabase.from("sitemap_logs").insert({
      trigger_type: "auto_serve",
      total_urls: urls.length,
      product_urls: productUrls.length,
      category_urls: categoryUrls.length,
      static_urls: 2,
      sitemap_content: xmlContent,
      success: true,
    });

    return new Response(xmlContent, {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving sitemap:", error);
    
    // Return a minimal fallback sitemap
    const fallbackXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE_URL}</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${BASE_URL}/order</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>`;

    return new Response(fallbackXml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=300", // Cache fallback for 5 mins
      },
    });
  }
});
